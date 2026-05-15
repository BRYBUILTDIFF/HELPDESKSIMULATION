const prisma = require("../prisma");
const { listPolicyEvents, getPolicySummary } = require("../store/policyEventStore");
const { listModules, updateModule } = require("../store/simulationModuleStore");

async function listUsers(req, res, next) {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    });

    return res.status(200).json({ users });
  } catch (err) {
    return next(err);
  }
}

async function updateUser(req, res, next) {
  try {
    const userId = Number(req.params.id);
    const { role, isActive } = req.body;

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      return res.status(404).json({ message: "User not found" });
    }

    if (req.user.id === userId && isActive === false) {
      return res.status(400).json({ message: "Admin cannot deactivate their own account" });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        role: role ?? undefined,
        isActive: typeof isActive === "boolean" ? isActive : undefined
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    });

    return res.status(200).json({ user: updated });
  } catch (err) {
    return next(err);
  }
}

async function softDeleteUser(req, res, next) {
  try {
    const userId = Number(req.params.id);
    if (req.user.id === userId) {
      return res.status(400).json({ message: "Admin cannot deactivate their own account" });
    }

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      return res.status(404).json({ message: "User not found" });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    });

    return res.status(200).json({ user: updated });
  } catch (err) {
    return next(err);
  }
}

async function getPolicyEvents(req, res, next) {
  try {
    const limit = Number(req.query.limit || 100);
    const events = listPolicyEvents(limit);
    return res.status(200).json({ events });
  } catch (err) {
    return next(err);
  }
}

async function getPolicySummaryAdmin(_req, res, next) {
  try {
    const summary = getPolicySummary();
    return res.status(200).json({ summary });
  } catch (err) {
    return next(err);
  }
}

async function getSimulationModules(_req, res, next) {
  try {
    const modules = listModules();
    return res.status(200).json({ modules });
  } catch (err) {
    return next(err);
  }
}

async function updateSimulationModule(req, res, next) {
  try {
    const id = String(req.params.id || "");
    const module = updateModule(id, req.body || {});
    if (!module) {
      return res.status(404).json({ message: "Simulation module not found" });
    }
    return res.status(200).json({ module });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listUsers,
  updateUser,
  softDeleteUser,
  getPolicyEvents,
  getPolicySummaryAdmin,
  getSimulationModules,
  updateSimulationModule
};
