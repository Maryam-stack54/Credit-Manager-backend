# Changes: User Roles and Customer Codes

This file explains, in simple words, what was added to Credit Manager in two improvements:

1. **Three kinds of users**: shop owner, staff and admin.
2. **A unique code for every customer**, like `CUS-0001`.

Both the backend (this folder, `Credit Manager Backend`) and the mobile app (`credit-manager`) were changed. The work is on a separate Git branch in each project, `feature/roles-and-customer-codes`, so the working version on `main` is untouched.

---

## 1. Improvement 1: Three kinds of users

### What each person can do

| | Shop owner | Staff | Admin |
|---|---|---|---|
| Add and view customers | Yes | Yes | No |
| Edit a customer | Yes | No | No |
| Delete a customer | Yes | No | No |
| Record a credit | Yes | Yes | No |
| Record a payment | Yes | Yes | No |
| Edit or delete a credit | Yes | No | No |
| See the dashboard totals | Yes | No | No |
| Add staff and turn their access on or off | Yes | No | No |
| See the list of shop owners and overall totals | No | No | Yes |
| Turn a shop owner's account on or off | No | No | Yes |
| See any shop's customers or what they owe | Own shop only | Own shop only | **Never** |

Notes:

- **Staff work on their owner's data.** A staff member logs in with their own username and password, but they see and add to the same customers and credits as the owner they work for.
- **The admin never sees shop data.** The admin pages return counts only (how many staff, customers and credits). The server refuses the admin on every customer, credit and dashboard route, and no admin page returns a customer name, phone number or money amount.
- **Staff cannot edit a customer.** The brief lists what staff *can* do (add and view customers, record credits and payments), and editing a customer was not on the list, so it is owner-only.
- **Registering always makes an owner.** Anyone who signs up through the Register screen is a shop owner. Any `role` sent with the request is ignored, so nobody can sign themselves up as staff or admin.

### Turned-off accounts

- A turned-off person cannot log in. They see **"Account disabled"**.
- It takes effect straight away. The server looks the person up on every request, so someone who is already logged in is also blocked on their next action and is logged out with the same message.
- Turning off a **shop owner** also blocks all of **their staff**. Turning off one **staff member** blocks only that person.
- A wrong password still says "Invalid username or password". "Account disabled" only appears after the correct password.

### Who recorded what

- Every **credit** remembers who recorded it (`createdBy`).
- Every **payment** remembers who recorded it (`recordedBy`).
- This is shown on the credit page ("Recorded by ..."), the payment history ("... by Name"), the credit cards in the Credits tab and the customer page, and the recent activity on the dashboard.
- Editing a credit keeps its original "recorded by".

### Screens in the app

- **Staff screen** (owners only): More tab, then **Staff**. Add a staff member (name, username, password) and switch each person's access on or off.
- **Reduced view for staff**: no Home (dashboard) tab, no edit or delete buttons on customers, no Edit Credit button, no Staff menu, and no editing of business details. Staff start on the Customers tab.
- **Admin area**: after logging in, the admin sees totals (shop owners, staff, customers, credits) and a list of shop owners, each with staff, customer and credit counts and an on/off switch. There is a Log out button and a Change password link. There is no way to open a customer from here.

---

## 2. Improvement 2: A unique code for every customer

- Every new customer automatically gets a code: `CUS-0001`, `CUS-0002`, `CUS-0003`, in the order they were added. Nobody types it and nobody can change it.
- **Each shop has its own numbering.** Two different shops can both have a `CUS-0001`. Inside one shop, a code can never repeat.
- **The database enforces this.** A unique index on (shop, code) makes the database refuse a repeat, even if the app had a bug.
- **A code is never reused.** The next number comes from a counter that only goes up. Deleting a customer does not free their number.
- **Two people adding at once never clash.** The counter is increased by the database in one step. The tests add 60 customers at the same moment from three different people and every code is different.
- **Repeated phone number.** If the shop already has a customer with the same phone number, the app asks: *"A customer with this phone number already exists. Add anyway?"* The customer is only added if the user agrees. `0803 123 4567` and `+234 803 123 4567` count as the same number. Another shop using the same number is not asked.
- **Where the code shows:** next to the name in the Customers list, on the customer's page, on the credit cards and credit page, and on the dashboard lists.
- **Search:** the Customers search box finds a customer by name, phone number, **code** or address.

---

## 3. Files changed

### Backend (`Credit Manager Backend`)

| File | What changed |
|---|---|
| `Models/userModel.js` | New fields `role`, `owner`, `isActive` |
| `Models/customerModel.js` | New field `code` and the unique index on (shop, code) |
| `Models/creditModel.js` | New fields `createdBy` and, on each payment, `recordedBy` |
| `Models/counterModel.js` | **New.** The counter that hands out customer codes |
| `Middlewares/authMiddleware.js` | Looks the person up on every request, blocks turned-off accounts, adds the `requireRole(...)` check |
| `Controllers/userController.js` | Register always makes an owner; login blocks disabled accounts and returns the role; staff see the owner's business details |
| `Controllers/staffController.js` | **New.** Add staff, list staff, turn staff on or off |
| `Controllers/adminController.js` | **New.** Totals, list of owners with counts, turn an owner on or off |
| `Controllers/customerController.js` | Creates codes, asks about repeated phone numbers, works on the shop's data for staff |
| `Controllers/creditController.js` | Records who recorded credits and payments, includes the customer code |
| `Controllers/dashboardController.js` | Includes codes and "recorded by" in its lists |
| `Routes/staffRoute.js`, `Routes/adminRoute.js` | **New.** Owner-only and admin-only routes |
| `Routes/customerRoute.js`, `creditRoute.js`, `dashboardRoute.js` | Role rules on each route |
| `index.js` | Adds `/api/staff` and `/api/admin` |
| `scripts/createAdmin.js` | **New.** One-time way to create the admin |
| `scripts/migrateRolesAndCodes.js` | **New.** One-time update for existing data |
| `tests/rolesAndCodes.test.js`, `package.json` | **New.** 39 automated tests, run with `npm test` |

### Mobile app (`credit-manager`)

| File | What changed |
|---|---|
| `services/session.js`, `hooks/useRole.js` | **New.** Remember the person's role and choose their first screen |
| `services/api.js` | Logs the person out with "Account disabled" if their account is turned off while they use the app |
| `app/auth/login.jsx` | Sends owner, staff and admin to their own first screens |
| `app/(tabs)/_layout.jsx` | Hides the Home tab for staff |
| `app/(tabs)/customers.jsx` | Shows codes, search by code, "Add anyway?" question |
| `app/(tabs)/credits.jsx`, `dashboard.jsx` | Show codes and "recorded by" |
| `app/(tabs)/more.jsx`, `app/more/edit-profile.jsx` | Staff row for owners; staff cannot edit business details |
| `app/customers/[id].jsx`, `app/credits/[id].jsx` | Show code and "recorded by"; no edit or delete buttons for staff |
| `app/more/staff.jsx` | **New.** The Staff screen for owners |
| `app/admin/index.jsx` | **New.** The admin area |
| `app/_layout.jsx` | Registers the two new screens |

(The app project also has an earlier, separate commit that upgrades it to Expo SDK 58 so it opens in the current Expo Go on iPhone. That is not part of these two improvements.)

---

## 4. New database fields

**Users** (`usermodels` collection)

| Field | Meaning |
|---|---|
| `role` | `"owner"`, `"staff"` or `"admin"`. Default `"owner"` |
| `owner` | For staff only: the ID of the shop owner they work for |
| `isActive` | `true` or `false`. A `false` account cannot log in. Default `true` |

**Customers** (`customers` collection)

| Field | Meaning |
|---|---|
| `code` | The customer's code, like `CUS-0001`. Cannot be changed. Unique together with `user` (the shop) |

**Credits** (`credits` collection)

| Field | Meaning |
|---|---|
| `createdBy` | The ID of the person who recorded the credit |
| `payments[].recordedBy` | The ID of the person who recorded that payment |

**Counters** (new `counters` collection)

| Field | Meaning |
|---|---|
| `_id` | `"customer:<shop owner ID>"` |
| `seq` | The last customer number given out for that shop. It only goes up |

**New routes**

| Route | Who | What |
|---|---|---|
| `POST /api/staff` | Owner | Add a staff member |
| `GET /api/staff` | Owner | List my staff |
| `PATCH /api/staff/:id/status` | Owner | Turn a staff member on or off |
| `GET /api/admin/overview` | Admin | Overall totals (counts) |
| `GET /api/admin/owners` | Admin | Shop owners with staff, customer and credit counts |
| `PATCH /api/admin/owners/:id/status` | Admin | Turn a shop owner on or off |

---

## 5. How each kind of user is created

- **Shop owner:** registers on the Register screen in the app. Nothing else is needed.
- **Staff:** a logged-in shop owner opens **More, then Staff** and adds them (name, username, password). The owner gives the staff member their username and password.
- **Admin:** cannot be created from the app. It is made once with a command in the backend folder:

  ```
  node scripts/createAdmin.js <username> <password> "Full Name"
  ```

  It is safe to run twice: if that admin already exists it changes nothing, and if the username already belongs to an owner or staff member it refuses.

---

## 6. The one-time update for existing data

The app already has users, customers and credits saved. This command updates them:

```
node scripts/migrateRolesAndCodes.js
```

What it does:

1. Gives every existing user the role `owner` and marks them active.
2. Marks the owner as the person who recorded every existing credit and payment (before this change only owners could record anything).
3. Gives every existing customer a code, in the order they were added, shop by shop.
4. Makes sure the unique code index exists.

Safety:

- **Safe to run twice.** A second run changes nothing. A customer who already has a code is never given a new one.
- **`--dry-run`** shows what would change and writes nothing.
- **It refuses to touch a database that is not on your own computer** unless you add `--i-have-a-backup`, so the real database cannot be changed by accident.

It was run on a local test copy built to look like the old data (old users with no role, customers with no code). The dry run changed nothing, the live run gave the codes in the right order, and the second run changed nothing.

**Order to follow on the real database:** back up the database first, then deploy the new backend, then run the update, then create the admin.

---

## 7. How it was tested

Run `npm test` in the backend folder. It runs 39 automated tests against a throwaway database on the computer (never the real one). All pass. They cover:

- **Owner:** can still do everything, including editing a credit and seeing the dashboard.
- **Staff:** can add and view customers and record credits and payments, and cannot delete a customer, edit or delete a credit, see the dashboard, or manage staff.
- **Admin:** sees owners and totals with counts only. Is refused on every customer, credit and dashboard route. The admin pages contain no customer names, phone numbers, codes or money amounts.
- **Turned-off accounts:** cannot log in ("Account disabled"). An already-logged-in person is blocked on their next request. Turning off an owner also blocks their staff. Turning them back on restores access.
- **Registration:** a `role` sent from the Register screen is ignored.
- **Recorded by:** credits and payments show the right person.
- **Codes:** correct order, separate numbering per shop, never reused after a delete, cannot be chosen or changed, the database refuses a repeat, and 60 customers added at the same moment all get different codes.
- **Phone numbers:** a repeat is asked about first and only added after the user agrees, written in different ways, and not asked across shops.
- **The one-time update:** dry run, live run, second run, continuing the numbering, and refusing a non-local database.

The mobile app was checked by a TypeScript check and by building the whole app (it bundles without errors). The new screens were not tapped through on a real phone, so please try each kind of login once on a device or in Expo Go before relying on them.

---

## 7b. Extra: reminders by SMS as well as WhatsApp

Next to **Remind on WhatsApp**, the customer page and the credit page now have **Remind by SMS**. It opens the phone's messaging app on the customer's number with the same polite reminder already typed in. Nothing is sent until the shop owner presses send, and it goes from the owner's own SIM at their normal SMS rate.

- Files: `services/whatsapp.js` (new `openSms`), `app/customers/[id].jsx`, `app/credits/[id].jsx`, and the Help text in `app/more/help.jsx`. No backend change.
- For SMS only, the `₦` sign and bullet points are swapped for `N` and `-`. Those special characters would make a phone switch to a format that fits only 70 characters per message part instead of 160, so this keeps the cost down.
- An incomplete phone number shows a warning instead of opening the messaging app.

---

## 8. Things to know

- **Staff cannot reset their own forgotten password** and an owner has no "reset password" button yet. This was not part of the brief. A staff member who knows their password can change it under More, then Change password.
- **Android users and the new app version.** The app project is now on Expo SDK 58. Phones that already have the older Android APK are on SDK 57, so they will not receive these app changes over the air. They need a new APK. Do not publish an Android update from this branch until a new APK is built. Raise the app version in `app.json` before building it, so old and new APKs do not receive each other's updates.
- **Customers added before the one-time update has been run** have no code until it is run. The app simply shows no code for them.
