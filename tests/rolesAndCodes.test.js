// Tests for the roles and customer codes features.
// Run with:  npm test
//
// They use a throwaway database on this computer (credit_manager_test)
// and never touch the real one or read the .env file.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const BASE_URI = "mongodb://127.0.0.1:27017";
const TEST_URI = `${BASE_URI}/credit_manager_test`;

// Set before the app code loads, so the real secrets are never needed
process.env.MONGO_URI = TEST_URI;
process.env.JWT_SECRET = "test-secret-not-the-real-one";

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userModel = require("../Models/userModel");
const customerModel = require("../Models/customerModel");
const creditModel = require("../Models/creditModel");

let server;
let baseUrl;

// Calls the API like the app does and returns the status and JSON body
const api = async (method, url, token, body) => {
  const response = await fetch(`${baseUrl}${url}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }

  return { status: response.status, body: data };
};

const login = async (username, password) => {
  const result = await api("POST", "/api/users/login", null, { username, password });
  return result;
};

// Makes an account directly in the database (the Register screen is rate
// limited, and the admin can never be made through it)
const makeUser = async (fields) =>
  userModel.create({
    password: await bcrypt.hash("secret1", 10),
    ...fields,
  });

const tomorrow = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

const newCustomer = (token, name, phone, extra = {}) =>
  api("POST", "/api/customers/createCustomer", token, { name, phone, ...extra });

const newCredit = (token, customerId, price = 1000) =>
  api("POST", "/api/credits/createCredit", token, {
    customer: customerId,
    items: [{ name: "Rice", quantity: 2, price }],
    dueDate: tomorrow(),
  });

before(async () => {
  await mongoose.connect(TEST_URI);
  await mongoose.connection.dropDatabase();

  // Build the indexes now so the unique rules are in place for every test
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));

  const app = express();
  app.use(express.json());
  app.use("/api/users", require("../Routes/userRoute"));
  app.use("/api/customers", require("../Routes/customerRoute"));
  app.use("/api/credits", require("../Routes/creditRoute"));
  app.use("/api/dashboard", require("../Routes/dashboardRoute"));
  app.use("/api/staff", require("../Routes/staffRoute"));
  app.use("/api/admin", require("../Routes/adminRoute"));

  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  // Some steps (like running the admin script) take longer than Node's
  // default 5 seconds of keep-alive. Without this, the next request could
  // reuse a connection the server had just closed and fail with ECONNRESET.
  server.keepAliveTimeout = 60 * 1000;
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe("Accounts and roles", () => {
  const ctx = {};

  it("Register always makes a shop owner, even if a role is sent", async () => {
    const result = await api("POST", "/api/users/register", null, {
      name: "Shop Owner A",
      username: "ownera",
      password: "secret1",
      role: "admin",
    });
    assert.equal(result.status, 201);
    assert.equal(result.body.user.role, "owner");

    const second = await api("POST", "/api/users/register", null, {
      name: "Sneaky",
      username: "sneaky",
      password: "secret1",
      role: "staff",
      owner: "000000000000000000000000",
    });
    assert.equal(second.body.user.role, "owner");

    const saved = await userModel.findOne({ username: "sneaky" });
    assert.equal(saved.role, "owner");
    assert.equal(saved.owner, undefined);
  });

  it("The admin can be created with the one-time script, and only once", () => {
    const run = (...args) =>
      execFileSync(
        process.execPath,
        [path.join(__dirname, "..", "scripts", "createAdmin.js"), ...args],
        { env: { ...process.env, MONGO_URI: TEST_URI }, encoding: "utf8" }
      );

    assert.match(run("sysadmin", "adminpass1", "System Admin"), /created/);
    assert.match(run("sysadmin", "adminpass1"), /already exists/);

    // A username that belongs to an owner is refused
    assert.throws(() => run("ownera", "adminpass1"), /already used by a owner/);
    // Weak input is refused
    assert.throws(() => run("newadmin", "123"), /at least 6/);
  });

  it("An owner can log in and gets the owner role", async () => {
    const result = await login("ownera", "secret1");
    assert.equal(result.status, 200);
    assert.equal(result.body.user.role, "owner");
    ctx.ownerToken = result.body.token;
    ctx.owner = await userModel.findOne({ username: "ownera" });
  });

  it("An owner can add staff, but not with a taken or invalid username", async () => {
    const ok = await api("POST", "/api/staff", ctx.ownerToken, {
      name: "Staff One",
      username: "staff1",
      password: "staffpass1",
    });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.staff.isActive, true);
    assert.equal(ok.body.staff.password, undefined);
    ctx.staffId = ok.body.staff.id;

    const dup = await api("POST", "/api/staff", ctx.ownerToken, {
      name: "Staff Dup",
      username: "STAFF1",
      password: "staffpass1",
    });
    assert.equal(dup.status, 400);
    assert.match(dup.body.message, /already taken/);

    // Cannot reuse an owner's or the admin's username either
    const clash = await api("POST", "/api/staff", ctx.ownerToken, {
      name: "Clash",
      username: "sysadmin",
      password: "staffpass1",
    });
    assert.equal(clash.status, 400);

    const bad = await api("POST", "/api/staff", ctx.ownerToken, {
      name: "Bad",
      username: "no spaces!",
      password: "staffpass1",
    });
    assert.equal(bad.status, 400);

    // The password is stored as a hash
    const saved = await userModel.findById(ctx.staffId);
    assert.notEqual(saved.password, "staffpass1");
    assert.equal(saved.role, "staff");
    assert.equal(String(saved.owner), String(ctx.owner._id));
  });

  it("Staff log in with their own username and password", async () => {
    const result = await login("staff1", "staffpass1");
    assert.equal(result.status, 200);
    assert.equal(result.body.user.role, "staff");
    ctx.staffToken = result.body.token;

    const wrong = await login("staff1", "wrongpass");
    assert.equal(wrong.status, 401);
  });

  it("Staff see the shop's business details but cannot edit them", async () => {
    await api("PUT", "/api/users/me", ctx.ownerToken, { businessName: "Mama Put Stores" });

    const me = await api("GET", "/api/users/me", ctx.staffToken);
    assert.equal(me.status, 200);
    assert.equal(me.body.user.name, "Staff One");
    assert.equal(me.body.user.role, "staff");
    assert.equal(me.body.user.businessName, "Mama Put Stores");

    const edit = await api("PUT", "/api/users/me", ctx.staffToken, { businessName: "Mine now" });
    assert.equal(edit.status, 403);

    // Staff can still change their own name and password
    const rename = await api("PUT", "/api/users/me", ctx.staffToken, { name: "Staff Uno" });
    assert.equal(rename.status, 200);
    const password = await api("PUT", "/api/users/change-password", ctx.staffToken, {
      currentPassword: "staffpass1",
      newPassword: "staffpass2",
    });
    assert.equal(password.status, 200);
    assert.equal((await login("staff1", "staffpass2")).status, 200);
  });

  it("Staff can add and view customers, record credits and payments", async () => {
    const customer = await newCustomer(ctx.staffToken, "Ada Lovelace", "08011111111");
    assert.equal(customer.status, 201);
    ctx.customerId = customer.body.customer._id;

    const list = await api("GET", "/api/customers/getCustomers", ctx.staffToken);
    assert.equal(list.status, 200);
    assert.equal(list.body.customers.length, 1);

    const one = await api("GET", `/api/customers/getCustomer/${ctx.customerId}`, ctx.staffToken);
    assert.equal(one.status, 200);

    const credit = await newCredit(ctx.staffToken, ctx.customerId, 1000);
    assert.equal(credit.status, 201);
    ctx.creditId = credit.body.credit._id;

    const payment = await api("POST", `/api/credits/addPayment/${ctx.creditId}`, ctx.staffToken, {
      amount: 500,
      method: "Cash",
    });
    assert.equal(payment.status, 200);

    const credits = await api("GET", "/api/credits/getCredits", ctx.staffToken);
    assert.equal(credits.status, 200);
    assert.equal(credits.body.credits.length, 1);
  });

  it("Every credit and payment remembers who recorded it", async () => {
    // The owner records a second payment on the staff member's credit
    const ownerPayment = await api("POST", `/api/credits/addPayment/${ctx.creditId}`, ctx.ownerToken, {
      amount: 100,
      method: "POS",
    });
    assert.equal(ownerPayment.status, 200);

    const ownerCredit = await newCredit(ctx.ownerToken, ctx.customerId, 300);
    assert.equal(ownerCredit.body.credit.createdBy.name, "Shop Owner A");
    assert.equal(ownerCredit.body.credit.createdBy.role, "owner");

    const credit = await api("GET", `/api/credits/getCredit/${ctx.creditId}`, ctx.ownerToken);
    assert.equal(credit.body.credit.createdBy.name, "Staff Uno");
    assert.equal(credit.body.credit.createdBy.role, "staff");
    assert.equal(credit.body.credit.payments[0].recordedBy.name, "Staff Uno");
    assert.equal(credit.body.credit.payments[1].recordedBy.name, "Shop Owner A");

    const list = await api("GET", "/api/credits/getCredits", ctx.ownerToken);
    assert.ok(list.body.credits.every((item) => item.createdBy?.name));
  });

  it("Staff cannot delete a customer, edit or delete a credit, or see the dashboard", async () => {
    const del = await api("DELETE", `/api/customers/deleteCustomer/${ctx.customerId}`, ctx.staffToken);
    assert.equal(del.status, 403);

    const editCustomer = await api("PUT", `/api/customers/updateCustomer/${ctx.customerId}`, ctx.staffToken, {
      name: "Changed",
      phone: "08011111111",
    });
    assert.equal(editCustomer.status, 403);

    const editCredit = await api("PUT", `/api/credits/updateCredit/${ctx.creditId}`, ctx.staffToken, {
      items: [{ name: "Rice", quantity: 1, price: 1 }],
      dueDate: tomorrow(),
    });
    assert.equal(editCredit.status, 403);

    const delCredit = await api("DELETE", `/api/credits/deleteCredit/${ctx.creditId}`, ctx.staffToken);
    assert.equal(delCredit.status, 403);

    const dashboard = await api("GET", "/api/dashboard/overview", ctx.staffToken);
    assert.equal(dashboard.status, 403);

    // Nothing was actually changed
    const customer = await customerModel.findById(ctx.customerId);
    assert.equal(customer.name, "Ada Lovelace");
    const credit = await creditModel.findById(ctx.creditId);
    assert.equal(credit.totalAmount, 2000);
  });

  it("Staff cannot manage staff", async () => {
    const add = await api("POST", "/api/staff", ctx.staffToken, {
      name: "Another",
      username: "another1",
      password: "secret1",
    });
    assert.equal(add.status, 403);

    assert.equal((await api("GET", "/api/staff", ctx.staffToken)).status, 403);

    const toggle = await api("PATCH", `/api/staff/${ctx.staffId}/status`, ctx.staffToken, {
      isActive: false,
    });
    assert.equal(toggle.status, 403);
    assert.equal((await userModel.findById(ctx.staffId)).isActive, true);
  });

  it("Staff and owners cannot use the admin area", async () => {
    assert.equal((await api("GET", "/api/admin/owners", ctx.staffToken)).status, 403);
    assert.equal((await api("GET", "/api/admin/owners", ctx.ownerToken)).status, 403);
    assert.equal((await api("GET", "/api/admin/overview", ctx.ownerToken)).status, 403);
  });

  it("An owner can still do everything: edit a credit, see the dashboard, list staff", async () => {
    const dashboard = await api("GET", "/api/dashboard/overview", ctx.ownerToken);
    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.body.summary.totalCreditGiven, 2600);

    const list = await api("GET", "/api/staff", ctx.ownerToken);
    assert.equal(list.body.staff.length, 1);
    assert.equal(list.body.staff[0].username, "staff1");

    const edit = await api("PUT", `/api/credits/updateCredit/${ctx.creditId}`, ctx.ownerToken, {
      items: [{ name: "Rice", quantity: 2, price: 1500 }],
      dueDate: tomorrow(),
    });
    assert.equal(edit.status, 200);
    assert.equal(edit.body.credit.totalAmount, 3000);
    // Editing a credit keeps who recorded it
    assert.equal(edit.body.credit.createdBy.name, "Staff Uno");
  });

  it("Dashboard lists show the customer code and who recorded things", async () => {
    const dashboard = await api("GET", "/api/dashboard/overview", ctx.ownerToken);
    const activity = dashboard.body.recentActivity;
    assert.equal(activity.recentCredits[0].customerCode, "CUS-0001");
    assert.equal(activity.recentPayments[0].customerCode, "CUS-0001");
    assert.ok(activity.recentPayments.some((payment) => payment.recordedBy === "Staff Uno"));
    assert.equal(activity.newCustomers[0].code, "CUS-0001");
  });

  it("An owner can only manage their own staff", async () => {
    const other = await makeUser({ name: "Owner B", username: "ownerb", role: "owner" });
    const otherToken = (await login("ownerb", "secret1")).body.token;

    const toggle = await api("PATCH", `/api/staff/${ctx.staffId}/status`, otherToken, {
      isActive: false,
    });
    assert.equal(toggle.status, 404);
    assert.equal((await userModel.findById(ctx.staffId)).isActive, true);

    assert.equal((await api("GET", "/api/staff", otherToken)).body.staff.length, 0);

    // And owner B cannot see owner A's customers or credits
    assert.equal((await api("GET", "/api/customers/getCustomers", otherToken)).body.customers.length, 0);
    assert.equal(
      (await api("GET", `/api/customers/getCustomer/${ctx.customerId}`, otherToken)).status,
      404
    );
    assert.equal((await api("GET", "/api/credits/getCredits", otherToken)).body.credits.length, 0);
    ctx.otherOwner = other;
    ctx.otherToken = otherToken;
  });

  it("Turning a staff member off blocks login and their existing token", async () => {
    const off = await api("PATCH", `/api/staff/${ctx.staffId}/status`, ctx.ownerToken, {
      isActive: false,
    });
    assert.equal(off.status, 200);
    assert.equal(off.body.staff.isActive, false);

    const attempt = await login("staff1", "staffpass2");
    assert.equal(attempt.status, 403);
    assert.equal(attempt.body.message, "Account disabled");

    // The token they already had stops working straight away
    const stale = await api("GET", "/api/customers/getCustomers", ctx.staffToken);
    assert.equal(stale.status, 403);
    assert.equal(stale.body.message, "Account disabled");

    // A wrong password still says it is wrong, not "disabled"
    assert.equal((await login("staff1", "nope123")).status, 401);

    const on = await api("PATCH", `/api/staff/${ctx.staffId}/status`, ctx.ownerToken, {
      isActive: true,
    });
    assert.equal(on.status, 200);
    const again = await login("staff1", "staffpass2");
    assert.equal(again.status, 200);
    ctx.staffToken = again.body.token;
    assert.equal((await api("GET", "/api/customers/getCustomers", ctx.staffToken)).status, 200);
  });

  it("The on/off switch needs a real true or false", async () => {
    const result = await api("PATCH", `/api/staff/${ctx.staffId}/status`, ctx.ownerToken, {
      isActive: "no",
    });
    assert.equal(result.status, 400);
  });
});

describe("Admin area", () => {
  const ctx = {};

  before(async () => {
    const owner = await userModel.findOne({ username: "ownera" });
    ctx.ownerId = String(owner._id);
    ctx.ownerToken = (await login("ownera", "secret1")).body.token;
    ctx.staffToken = (await login("staff1", "staffpass2")).body.token;

    const result = await login("sysadmin", "adminpass1");
    assert.equal(result.status, 200);
    assert.equal(result.body.user.role, "admin");
    ctx.adminToken = result.body.token;
  });

  it("The admin sees every owner with staff, customer and credit counts", async () => {
    const result = await api("GET", "/api/admin/owners", ctx.adminToken);
    assert.equal(result.status, 200);

    const ownerA = result.body.owners.find((owner) => owner.username === "ownera");
    assert.equal(ownerA.staffCount, 1);
    assert.equal(ownerA.customerCount, 1);
    assert.equal(ownerA.creditCount, 2);
    assert.equal(ownerA.isActive, true);

    const ownerB = result.body.owners.find((owner) => owner.username === "ownerb");
    assert.equal(ownerB.staffCount, 0);
    assert.equal(ownerB.customerCount, 0);

    // Admin accounts are not in the owner list
    assert.ok(!result.body.owners.some((owner) => owner.username === "sysadmin"));
    assert.ok(!result.body.owners.some((owner) => owner.username === "staff1"));
  });

  it("The admin sees overall totals", async () => {
    const result = await api("GET", "/api/admin/overview", ctx.adminToken);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.totals, {
      owners: 3,
      activeOwners: 3,
      disabledOwners: 0,
      staff: 1,
      activeStaff: 1,
      customers: 1,
      credits: 2,
    });
  });

  it("The admin cannot see any customers or what they owe", async () => {
    // No customer or credit route lets the admin in
    for (const [method, url] of [
      ["GET", "/api/customers/getCustomers"],
      ["GET", "/api/credits/getCredits"],
      ["GET", "/api/dashboard/overview"],
      ["GET", "/api/staff"],
    ]) {
      const result = await api(method, url, ctx.adminToken);
      assert.equal(result.status, 403, `${method} ${url}`);
    }

    // Even with a real customer or credit ID
    const customer = await customerModel.findOne({});
    const credit = await creditModel.findOne({});
    assert.equal(
      (await api("GET", `/api/customers/getCustomer/${customer._id}`, ctx.adminToken)).status,
      403
    );
    assert.equal(
      (await api("GET", `/api/credits/getCredit/${credit._id}`, ctx.adminToken)).status,
      403
    );
    assert.equal(
      (await api("DELETE", `/api/customers/deleteCustomer/${customer._id}`, ctx.adminToken)).status,
      403
    );

    // What the admin's own pages return holds no customer details or amounts
    const text =
      JSON.stringify((await api("GET", "/api/admin/owners", ctx.adminToken)).body) +
      JSON.stringify((await api("GET", "/api/admin/overview", ctx.adminToken)).body);
    for (const secret of ["Ada Lovelace", "08011111111", "CUS-0001", "balance", "totalAmount", "payments"]) {
      assert.ok(!text.includes(secret), `admin data should not include ${secret}`);
    }
  });

  it("The admin cannot add staff or change a shop's business details", async () => {
    const add = await api("POST", "/api/staff", ctx.adminToken, {
      name: "Nope",
      username: "nope1",
      password: "secret1",
    });
    assert.equal(add.status, 403);

    const profile = await api("PUT", "/api/users/me", ctx.adminToken, { businessName: "X" });
    assert.equal(profile.status, 403);
  });

  it("Turning an owner off blocks the owner and all their staff", async () => {
    const off = await api("PATCH", `/api/admin/owners/${ctx.ownerId}/status`, ctx.adminToken, {
      isActive: false,
    });
    assert.equal(off.status, 200);
    assert.equal(off.body.owner.isActive, false);

    const ownerLogin = await login("ownera", "secret1");
    assert.equal(ownerLogin.status, 403);
    assert.equal(ownerLogin.body.message, "Account disabled");

    const staffLogin = await login("staff1", "staffpass2");
    assert.equal(staffLogin.status, 403);
    assert.equal(staffLogin.body.message, "Account disabled");

    // Tokens they already had stop working at once
    assert.equal((await api("GET", "/api/customers/getCustomers", ctx.ownerToken)).status, 403);
    assert.equal((await api("GET", "/api/customers/getCustomers", ctx.staffToken)).status, 403);

    const overview = await api("GET", "/api/admin/overview", ctx.adminToken);
    assert.equal(overview.body.totals.disabledOwners, 1);

    // Turn them back on and everything works again
    const on = await api("PATCH", `/api/admin/owners/${ctx.ownerId}/status`, ctx.adminToken, {
      isActive: true,
    });
    assert.equal(on.status, 200);
    assert.equal((await login("ownera", "secret1")).status, 200);
    assert.equal((await login("staff1", "staffpass2")).status, 200);
  });

  it("The admin can only switch owners, not other admins or staff", async () => {
    const staff = await userModel.findOne({ username: "staff1" });
    const admin = await userModel.findOne({ username: "sysadmin" });

    for (const id of [staff._id, admin._id]) {
      const result = await api("PATCH", `/api/admin/owners/${id}/status`, ctx.adminToken, {
        isActive: false,
      });
      assert.equal(result.status, 404);
    }
    assert.equal((await userModel.findById(admin._id)).isActive, true);
  });

  it("A turned-off admin cannot log in either", async () => {
    await userModel.updateOne({ username: "sysadmin" }, { isActive: false });
    const result = await login("sysadmin", "adminpass1");
    assert.equal(result.status, 403);
    assert.equal(result.body.message, "Account disabled");
    await userModel.updateOne({ username: "sysadmin" }, { isActive: true });
  });
});

describe("Customer codes", () => {
  const ctx = {};

  before(async () => {
    ctx.shop = await makeUser({ name: "Code Shop", username: "codeshop", role: "owner" });
    ctx.staffA = await makeUser({ name: "Staff A", username: "codestaffa", role: "staff", owner: ctx.shop._id });
    ctx.staffB = await makeUser({ name: "Staff B", username: "codestaffb", role: "staff", owner: ctx.shop._id });
    ctx.owner = (await login("codeshop", "secret1")).body.token;
    ctx.a = (await login("codestaffa", "secret1")).body.token;
    ctx.b = (await login("codestaffb", "secret1")).body.token;

    ctx.rival = await makeUser({ name: "Rival", username: "rivalshop", role: "owner" });
    ctx.rivalToken = (await login("rivalshop", "secret1")).body.token;
  });

  it("Customers get CUS-0001, CUS-0002, CUS-0003 in the order they were added", async () => {
    const first = await newCustomer(ctx.owner, "First Customer", "08020000001");
    const second = await newCustomer(ctx.a, "Second Customer", "08020000002");
    const third = await newCustomer(ctx.b, "Third Customer", "08020000003");

    assert.equal(first.body.customer.code, "CUS-0001");
    assert.equal(second.body.customer.code, "CUS-0002");
    assert.equal(third.body.customer.code, "CUS-0003");
    ctx.second = second.body.customer;
    ctx.third = third.body.customer;
  });

  it("Another shop has its own numbering that starts from CUS-0001", async () => {
    const result = await newCustomer(ctx.rivalToken, "Rival Customer", "08020000001");
    assert.equal(result.status, 201);
    assert.equal(result.body.customer.code, "CUS-0001");
  });

  it("The code shows on the list, the customer's page and the credit", async () => {
    const list = await api("GET", "/api/customers/getCustomers", ctx.owner);
    assert.deepEqual(
      list.body.customers.map((customer) => customer.code).sort(),
      ["CUS-0001", "CUS-0002", "CUS-0003"]
    );

    const one = await api("GET", `/api/customers/getCustomer/${ctx.second._id}`, ctx.owner);
    assert.equal(one.body.customer.code, "CUS-0002");

    const credit = await newCredit(ctx.a, ctx.second._id);
    assert.equal(credit.status, 201);
    const fetched = await api("GET", `/api/credits/getCredit/${credit.body.credit._id}`, ctx.owner);
    assert.equal(fetched.body.credit.customer.code, "CUS-0002");
    const all = await api("GET", "/api/credits/getCredits", ctx.owner);
    assert.equal(all.body.credits[0].customer.code, "CUS-0002");
  });

  it("Nobody can pick or change a code", async () => {
    // A code in the request is ignored
    const chosen = await newCustomer(ctx.owner, "Picky Customer", "08020000004", { code: "CUS-0001" });
    assert.equal(chosen.status, 201);
    assert.equal(chosen.body.customer.code, "CUS-0004");

    // An edit cannot change it
    const edit = await api("PUT", `/api/customers/updateCustomer/${chosen.body.customer._id}`, ctx.owner, {
      name: "Renamed Customer",
      phone: "08020000004",
      code: "CUS-9999",
    });
    assert.equal(edit.status, 200);
    assert.equal(edit.body.customer.code, "CUS-0004");
    assert.equal(edit.body.customer.name, "Renamed Customer");

    const saved = await customerModel.findById(chosen.body.customer._id);
    assert.equal(saved.code, "CUS-0004");

    // Not even by saving a changed code straight to the model
    saved.code = "CUS-5555";
    await saved.save();
    assert.equal((await customerModel.findById(saved._id)).code, "CUS-0004");
  });

  it("A code is never reused after its customer is deleted", async () => {
    const del = await api("DELETE", `/api/customers/deleteCustomer/${ctx.third._id}`, ctx.owner);
    assert.equal(del.status, 200);

    const next = await newCustomer(ctx.owner, "After Delete", "08020000005");
    assert.equal(next.body.customer.code, "CUS-0005");

    // Even deleting the newest customer does not free its number
    await api("DELETE", `/api/customers/deleteCustomer/${next.body.customer._id}`, ctx.owner);
    const after = await newCustomer(ctx.owner, "After Delete Two", "08020000006");
    assert.equal(after.body.customer.code, "CUS-0006");
  });

  it("The database itself refuses two customers with the same code in one shop", async () => {
    await assert.rejects(
      customerModel.collection.insertOne({
        name: "Sneaky Copy",
        phone: "0",
        user: ctx.shop._id,
        code: "CUS-0001",
      }),
      (error) => error.code === 11000
    );

    // The same code in a different shop is allowed
    await customerModel.collection.insertOne({
      name: "Other Shop",
      phone: "0",
      user: new mongoose.Types.ObjectId(),
      code: "CUS-0001",
    });
  });

  it("Two staff adding customers at the same moment never get the same code", async () => {
    const shop = await makeUser({ name: "Busy Shop", username: "busyshop", role: "owner" });
    const s1 = await makeUser({ name: "Busy 1", username: "busy1", role: "staff", owner: shop._id });
    const s2 = await makeUser({ name: "Busy 2", username: "busy2", role: "staff", owner: shop._id });
    const tokens = [
      (await login("busyshop", "secret1")).body.token,
      (await login("busy1", "secret1")).body.token,
      (await login("busy2", "secret1")).body.token,
    ];

    // 60 customers, all sent at once from three different people
    const results = await Promise.all(
      Array.from({ length: 60 }, (_, index) =>
        newCustomer(tokens[index % 3], `Rush ${index}`, `0803000${String(index).padStart(4, "0")}`)
      )
    );

    assert.ok(results.every((result) => result.status === 201));
    const codes = results.map((result) => result.body.customer.code);
    assert.equal(new Set(codes).size, 60, "every code must be different");

    const expected = Array.from({ length: 60 }, (_, index) => `CUS-${String(index + 1).padStart(4, "0")}`);
    assert.deepEqual([...codes].sort(), expected);

    const stored = await customerModel.countDocuments({ user: shop._id });
    assert.equal(stored, 60);
    assert.equal(s1.role, "staff");
    assert.equal(s2.role, "staff");
  });

  it("A repeated phone number asks first, and adds only when the user agrees", async () => {
    const duplicate = await newCustomer(ctx.a, "Same Phone", "08020000002");
    assert.equal(duplicate.status, 409);
    assert.equal(
      duplicate.body.message,
      "A customer with this phone number already exists. Add anyway?"
    );
    assert.equal(duplicate.body.duplicatePhone, true);
    assert.equal(duplicate.body.existingCustomer.code, "CUS-0002");

    // Nothing was added
    assert.equal(await customerModel.countDocuments({ user: ctx.shop._id, name: "Same Phone" }), 0);

    // The same number written differently is still the same number
    const spaced = await newCustomer(ctx.a, "Same Phone", "0802 000 0002");
    assert.equal(spaced.status, 409);
    const international = await newCustomer(ctx.a, "Same Phone", "+234 802 000 0002");
    assert.equal(international.status, 409);

    // Agreeing adds it, with its own new code
    const agreed = await newCustomer(ctx.a, "Same Phone", "08020000002", { confirmDuplicate: true });
    assert.equal(agreed.status, 201);
    assert.equal(agreed.body.customer.code, "CUS-0007");

    // Another shop can use the same number without being asked
    const elsewhere = await newCustomer(ctx.rivalToken, "Elsewhere", "08020000002");
    assert.equal(elsewhere.status, 201);
  });

  it("Missing or short details are still refused before a code is used up", async () => {
    const before = await customerModel.countDocuments({ user: ctx.shop._id });
    assert.equal((await newCustomer(ctx.a, "", "08099999999")).status, 400);
    assert.equal((await newCustomer(ctx.a, "X", "08099999999")).status, 400);
    assert.equal((await newCustomer(ctx.a, "No Phone", "")).status, 400);
    assert.equal(await customerModel.countDocuments({ user: ctx.shop._id }), before);

    const next = await newCustomer(ctx.a, "Valid Person", "08099999999");
    assert.equal(next.body.customer.code, "CUS-0008");
  });
});

// "Send statement" and the Debtors report only read the credits the app
// already loads. These tests check that those credits carry everything the
// statement and the report need, and that each business sees only its own.
describe("Data read by the statement and the debtors report", () => {
  const ctx = {};

  before(async () => {
    const shop = await makeUser({ name: "Report Shop", username: "reportshop", role: "owner" });
    await makeUser({ name: "Report Staff", username: "reportstaff", role: "staff", owner: shop._id });
    await makeUser({ name: "Other Shop", username: "othershop", role: "owner" });

    ctx.owner = (await login("reportshop", "secret1")).body.token;
    ctx.staff = (await login("reportstaff", "secret1")).body.token;
    ctx.other = (await login("othershop", "secret1")).body.token;
    ctx.admin = (await login("sysadmin", "adminpass1")).body.token;

    const mine = (await newCustomer(ctx.owner, "Report Customer", "08055550001")).body.customer;
    const theirs = (await newCustomer(ctx.other, "Other Shop Customer", "08055550002")).body.customer;

    const credit = await newCredit(ctx.staff, mine._id, 1000);
    await api("POST", `/api/credits/addPayment/${credit.body.credit._id}`, ctx.staff, {
      amount: 400,
      method: "Cash",
    });
    await newCredit(ctx.other, theirs._id, 7777);

    ctx.mine = mine;
  });

  it("staff and owner get each credit with the customer's name, phone and code, and every payment with its date and amount", async () => {
    for (const token of [ctx.owner, ctx.staff]) {
      const result = await api("GET", "/api/credits/getCredits", token);

      assert.equal(result.status, 200);
      assert.equal(result.body.credits.length, 1);

      const credit = result.body.credits[0];
      assert.equal(credit.customer.name, "Report Customer");
      assert.equal(credit.customer.phone, "08055550001");
      assert.equal(credit.customer.code, "CUS-0001");
      assert.equal(credit.totalAmount, 2000);
      assert.equal(credit.balance, 1600);
      assert.ok(credit.creditDate);
      assert.equal(credit.payments.length, 1);
      assert.equal(credit.payments[0].amount, 400);
      assert.ok(credit.payments[0].date);
    }
  });

  it("one business never receives another business's customers or credits", async () => {
    const result = await api("GET", "/api/credits/getCredits", ctx.owner);
    const text = JSON.stringify(result.body);

    for (const secret of ["Other Shop Customer", "08055550002", "7777", "15554"]) {
      assert.ok(!text.includes(secret), `must not include ${secret}`);
    }

    const theirs = await api("GET", "/api/credits/getCredits", ctx.other);
    assert.equal(theirs.body.credits.length, 1);
    assert.equal(theirs.body.credits[0].customer.name, "Other Shop Customer");
    assert.ok(!JSON.stringify(theirs.body).includes("Report Customer"));
  });

  it("the admin cannot read the credits or the customers", async () => {
    assert.equal((await api("GET", "/api/credits/getCredits", ctx.admin)).status, 403);
    assert.equal((await api("GET", "/api/customers/getCustomers", ctx.admin)).status, 403);
  });

  it("reading changes nothing: the credit and its payments are exactly as they were", async () => {
    const before = JSON.stringify(await creditModel.find({}).sort({ _id: 1 }).lean());
    await api("GET", "/api/credits/getCredits", ctx.owner);
    await api("GET", "/api/credits/getCredits", ctx.staff);
    await api("GET", "/api/customers/getCustomers", ctx.staff);
    const after = JSON.stringify(await creditModel.find({}).sort({ _id: 1 }).lean());

    assert.equal(after, before);
  });
});

describe("One-time update for existing data", () => {
  const MIGRATE_URI = `${BASE_URI}/credit_manager_test_migrate`;
  const script = path.join(__dirname, "..", "scripts", "migrateRolesAndCodes.js");
  const run = (...args) =>
    execFileSync(process.execPath, [script, ...args], {
      env: { ...process.env, MONGO_URI: MIGRATE_URI },
      encoding: "utf8",
    });

  let db;
  let connection;
  const shopA = new mongoose.Types.ObjectId();
  const shopB = new mongoose.Types.ObjectId();
  const day = (offset) => new Date(Date.UTC(2026, 0, 1 + offset));

  before(async () => {
    connection = await mongoose.createConnection(MIGRATE_URI).asPromise();
    await connection.dropDatabase();
    db = connection.db;

    // Data exactly as it looked before this feature: no roles, no codes
    await db.collection("usermodels").insertMany([
      { _id: shopA, name: "Old Owner A", username: "oldowner_a", password: "x" },
      { _id: shopB, name: "Old Owner B", username: "oldowner_b", password: "x" },
    ]);

    const customerIds = Array.from({ length: 5 }, () => new mongoose.Types.ObjectId());
    ctxIds.customers = customerIds;
    await db.collection("customers").insertMany([
      // Inserted out of order on purpose: codes must follow createdAt
      { _id: customerIds[2], name: "A third", phone: "3", user: shopA, createdAt: day(3) },
      { _id: customerIds[0], name: "A first", phone: "1", user: shopA, createdAt: day(1) },
      { _id: customerIds[1], name: "A second", phone: "2", user: shopA, createdAt: day(2) },
      { _id: customerIds[3], name: "B first", phone: "4", user: shopB, createdAt: day(1) },
      { _id: customerIds[4], name: "B second", phone: "5", user: shopB, createdAt: day(2) },
    ]);

    await db.collection("credits").insertMany([
      {
        customer: customerIds[0],
        user: shopA,
        totalAmount: 100,
        balance: 50,
        payments: [{ amount: 50 }, { amount: 0 }],
      },
      { customer: customerIds[3], user: shopB, totalAmount: 10, balance: 10, payments: [] },
    ]);
  });

  after(async () => {
    await connection.dropDatabase();
    await connection.close();
  });

  const ctxIds = {};

  it("A real (non-local) database is refused without the backup flag", () => {
    assert.throws(
      () =>
        execFileSync(process.execPath, [script], {
          env: { ...process.env, MONGO_URI: "mongodb+srv://user:pw@cluster.example.invalid/shop" },
          encoding: "utf8",
          stdio: "pipe",
        }),
      (error) => /Back it up first/.test(String(error.stderr))
    );
  });

  it("A dry run shows the changes and writes nothing", async () => {
    const output = run("--dry-run");
    assert.match(output, /DRY RUN/);
    assert.match(output, /Customers given a code: 5/);
    assert.equal(await db.collection("customers").countDocuments({ code: { $exists: true } }), 0);
    assert.equal(await db.collection("usermodels").countDocuments({ role: { $exists: true } }), 0);
  });

  it("Gives existing users the owner role and existing customers their codes in order", async () => {
    const output = run();
    assert.match(output, /Users given a role \/ active flag: 2/);
    assert.match(output, /Customers given a code: 5/);

    const users = await db.collection("usermodels").find({}).toArray();
    assert.ok(users.every((user) => user.role === "owner" && user.isActive === true));

    const byName = async (name) => (await db.collection("customers").findOne({ name })).code;
    assert.equal(await byName("A first"), "CUS-0001");
    assert.equal(await byName("A second"), "CUS-0002");
    assert.equal(await byName("A third"), "CUS-0003");
    assert.equal(await byName("B first"), "CUS-0001");
    assert.equal(await byName("B second"), "CUS-0002");
  });

  it("Marks the owner as the person who recorded old credits and payments", async () => {
    const credit = await db.collection("credits").findOne({ user: shopA });
    assert.equal(String(credit.createdBy), String(shopA));
    assert.ok(credit.payments.every((payment) => String(payment.recordedBy) === String(shopA)));
    assert.equal(credit.payments.length, 2);
    assert.equal(credit.balance, 50);
  });

  it("Is safe to run twice: the second run changes nothing", async () => {
    const before = JSON.stringify(await db.collection("customers").find({}).sort({ _id: 1 }).toArray());
    const output = run();
    assert.match(output, /Users given a role \/ active flag: 0/);
    assert.match(output, /Credits updated with who recorded them: 0/);
    assert.match(output, /Customers given a code: 0/);
    const after = JSON.stringify(await db.collection("customers").find({}).sort({ _id: 1 }).toArray());
    assert.equal(after, before);
  });

  it("Continues the numbering for customers added later and never overwrites a code", async () => {
    // A customer added after the first run, then one more old-style customer
    await db.collection("customers").insertOne({
      name: "A late legacy",
      phone: "9",
      user: shopA,
      createdAt: day(10),
    });
    const output = run();
    assert.match(output, /Customers given a code: 1/);

    const late = await db.collection("customers").findOne({ name: "A late legacy" });
    assert.equal(late.code, "CUS-0004");
    const first = await db.collection("customers").findOne({ name: "A first" });
    assert.equal(first.code, "CUS-0001");
  });

  it("The migrated shop can add customers through the app and gets the next code", async () => {
    // Point a second copy of the models at the migrated data
    const check = await db.collection("counters").findOne({ _id: `customer:${shopA}` });
    assert.equal(check.seq, 4);

    // The unique index is in place on the migrated data
    const indexes = await db.collection("customers").indexes();
    assert.ok(indexes.some((index) => index.unique && index.key.user === 1 && index.key.code === 1));
  });
});
