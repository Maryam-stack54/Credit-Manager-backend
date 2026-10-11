const creditModel = require("../Models/creditModel");
const customerModel = require("../Models/customerModel");

// --------------------------------
// DASHBOARD SUMMARY
// --------------------------------

const getDashboardSummary = (userCredits) => {
  // Money customers still owe across all credits
  const totalOutstanding = userCredits.reduce(
    (sum, credit) => sum + credit.balance,
    0
  );

  // Count each customer once, even if they have several unpaid credits
  const customersOwing = new Set(
    userCredits
      .filter((credit) => credit.balance > 0)
      .map((credit) => credit.customer._id.toString())
  ).size;

  // Value of all goods ever given on credit
  const totalCreditGiven = userCredits.reduce(
    (sum, credit) => sum + credit.totalAmount,
    0
  );

  // Every payment ever received
  const totalCollected = userCredits.reduce(
    (sum, credit) =>
      sum +
      credit.payments.reduce(
        (paymentSum, payment) => paymentSum + payment.amount,
        0
      ),
    0
  );

  // Percentage of credit given that has been paid back
  const collectionRate =
    totalCreditGiven > 0
      ? (totalCollected / totalCreditGiven) * 100
      : 0;

  // Credits that still have money owed
  const activeCredits = userCredits.filter(
    (credit) => credit.balance > 0
  ).length;

  // Start of the current week (Monday)
  const today = new Date();
  const day = today.getDay();

  const daysFromMonday = day === 0 ? 6 : day - 1;

  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - daysFromMonday);
  startOfWeek.setHours(0, 0, 0, 0);

  // Total payments collected this week
  const collectedThisWeek = userCredits.reduce(
    (sum, credit) => {
      const weeklyPayments = credit.payments
        .filter((payment) => {
          return new Date(payment.date) >= startOfWeek;
        })
        .reduce(
          (paymentSum, payment) => paymentSum + payment.amount,
          0
        );

      return sum + weeklyPayments;
    },
    0
  );

  return {
    totalOutstanding,
    customersOwing,
    totalCreditGiven,
    totalCollected,
    collectedThisWeek,
    collectionRate: Number(collectionRate.toFixed(2)),
    activeCredits,
  };
};

// --------------------------------
// DASHBOARD ATTENTION
// --------------------------------

const getDashboardAttention = (userCredits) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sevenDaysFromNow = new Date(today);
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

  // Overdue credits
  const overdueCredits = userCredits
    .filter(
      (credit) =>
        credit.balance > 0 &&
        credit.dueDate &&
        new Date(credit.dueDate) < today
    )
    .sort(
      (a, b) => new Date(a.dueDate) - new Date(b.dueDate)
    )
    .slice(0, 5)
    .map((credit) => ({
      id: credit._id,
      customer: credit.customer.name,
      balance: credit.balance,
      dueDate: credit.dueDate,
      status: credit.status,
    }));

  // Credits due today or within 7 days
  const dueSoonCredits = userCredits
    .filter((credit) => {
      if (credit.balance <= 0 || !credit.dueDate) {
        return false;
      }

      const dueDate = new Date(credit.dueDate);

      return dueDate >= today && dueDate <= sevenDaysFromNow;
    })
    .sort(
      (a, b) => new Date(a.dueDate) - new Date(b.dueDate)
    )
    .slice(0, 5)
    .map((credit) => ({
      id: credit._id,
      customer: credit.customer.name,
      balance: credit.balance,
      dueDate: credit.dueDate,
      status: credit.status,
    }));

  // Customers with the largest outstanding balances
  const customerBalances = {};

  userCredits.forEach((credit) => {
    if (credit.balance > 0) {
      const customerId = credit.customer._id.toString();

      if (!customerBalances[customerId]) {
        customerBalances[customerId] = {
          id: credit.customer._id,
          name: credit.customer.name,
          balance: 0,
        };
      }

      customerBalances[customerId].balance += credit.balance;
    }
  });

  // The five customers who owe the most
  const topOutstandingCustomers = Object.values(
    customerBalances
  )
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5);

  // Total value of all overdue credits
  const amountOverdue = overdueCredits.reduce(
    (sum, credit) => sum + credit.balance,
    0
  );

  return {
    amountOverdue,
    overdueCredits,
    dueSoonCredits,
    topOutstandingCustomers,
  };
};

// --------------------------------
// RECENT ACTIVITY
// --------------------------------

const getRecentActivity = (userCredits, customers) => {
  // Recent credits
  const recentCredits = [...userCredits]
    .sort(
      (a, b) =>
        new Date(b.creditDate) - new Date(a.creditDate)
    )
    .slice(0, 5)
    .map((credit) => ({
      id: credit._id,
      customer: credit.customer.name,
      amount: credit.totalAmount,
      date: credit.creditDate,
    }));

  // Recent payments
  const payments = [];

  userCredits.forEach((credit) => {
    credit.payments.forEach((payment) => {
      payments.push({
        id: payment._id,
        creditId: credit._id,
        customer: credit.customer.name,
        amount: payment.amount,
        method: payment.method,
        date: payment.date,
      });
    });
  });

  const recentPayments = payments
    .sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    )
    .slice(0, 5);

  // New customers
  const newCustomers = [...customers]
    .sort(
      (a, b) =>
        new Date(b.createdAt) - new Date(a.createdAt)
    )
    .slice(0, 5)
    .map((customer) => ({
      id: customer._id,
      name: customer.name,
      phone: customer.phone,
      createdAt: customer.createdAt,
    }));

  return {
    recentCredits,
    recentPayments,
    newCustomers,
  };
};

// --------------------------------
// MAIN DASHBOARD FUNCTION
// --------------------------------

const getDashboardOverview = async (req, res) => {
  try {
    const userId = req.user.userId;

    const customers = await customerModel.find({
      user: userId,
    });

    const credits = await creditModel
      .find({ user: userId })
      .populate({
        path: "customer",
        match: { user: userId },
        select: "name phone address",
      });

    // Leave out credits whose customer has been deleted
    const userCredits = credits.filter(
      (credit) => credit.customer
    );

    const summary = getDashboardSummary(userCredits);

    const attention = getDashboardAttention(userCredits);

    const recentActivity = getRecentActivity(
      userCredits,
      customers
    );

    return res.status(200).json({
      summary: {
        ...summary,
        amountOverdue: attention.amountOverdue,
      },

      attention: {
        overdueCredits: attention.overdueCredits,
        dueSoonCredits: attention.dueSoonCredits,
        topOutstandingCustomers:
          attention.topOutstandingCustomers,
      },

      recentActivity,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Server error",
    });
  }
};

module.exports = {
  getDashboardOverview,
};