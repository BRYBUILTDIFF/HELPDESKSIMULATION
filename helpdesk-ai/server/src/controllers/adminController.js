const prisma = require("../prisma");
const { listPolicyEvents, getPolicySummary } = require("../store/policyEventStore");
const { listModules, updateModule } = require("../store/simulationModuleStore");
const { hashPassword } = require("../utils/password");
const {
  getPolicyConfig,
  replacePolicyConfig,
  addPolicyListEntry,
  updatePolicyListEntry,
  deletePolicyListEntry,
  resetPolicyConfig
} = require("../store/policyConfigStore");

const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

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

async function createUser(req, res, next) {
  try {
    const { firstName, lastName, email, password, role, isActive } = req.body;

    if (!PASSWORD_REGEX.test(String(password || ""))) {
      return res.status(400).json({
        message: "Password must be at least 8 characters and include uppercase, number, and special character."
      });
    }

    const normalizedEmail = String(email || "").trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return res.status(409).json({ message: "Email already exists" });
    }

    const passwordHash = await hashPassword(password);
    const created = await prisma.user.create({
      data: {
        firstName: String(firstName || "").trim(),
        lastName: String(lastName || "").trim(),
        email: normalizedEmail,
        passwordHash,
        role: role || "USER",
        isActive: typeof isActive === "boolean" ? isActive : true
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

    return res.status(201).json({ user: created });
  } catch (err) {
    if (err?.code === "P2002") {
      return res.status(409).json({ message: "Email already exists" });
    }
    return next(err);
  }
}

async function updateUser(req, res, next) {
  try {
    const userId = Number(req.params.id);
    const { firstName, lastName, email, password, role, isActive } = req.body;

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      return res.status(404).json({ message: "User not found" });
    }

    if (req.user.id === userId && isActive === false) {
      return res.status(400).json({ message: "Admin cannot deactivate their own account" });
    }
    if (req.user.id === userId && role === "USER") {
      return res.status(400).json({ message: "Admin cannot demote their own account" });
    }

    if (password && !PASSWORD_REGEX.test(String(password))) {
      return res.status(400).json({
        message: "Password must be at least 8 characters and include uppercase, number, and special character."
      });
    }

    const nextEmail = typeof email === "string" ? email.trim().toLowerCase() : undefined;
    if (nextEmail && nextEmail !== existing.email) {
      const emailConflict = await prisma.user.findUnique({ where: { email: nextEmail } });
      if (emailConflict && emailConflict.id !== userId) {
        return res.status(409).json({ message: "Email already exists" });
      }
    }

    const passwordHash = password ? await hashPassword(password) : undefined;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        firstName: typeof firstName === "string" ? firstName.trim() : undefined,
        lastName: typeof lastName === "string" ? lastName.trim() : undefined,
        email: nextEmail,
        passwordHash,
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
    if (err?.code === "P2002") {
      return res.status(409).json({ message: "Email already exists" });
    }
    return next(err);
  }
}

async function hardDeleteUser(req, res, next) {
  try {
    const userId = Number(req.params.id);
    if (req.user.id === userId) {
      return res.status(400).json({ message: "Admin cannot delete their own account" });
    }

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      return res.status(404).json({ message: "User not found" });
    }

    await prisma.user.delete({
      where: { id: userId },
    });

    return res.status(200).json({ ok: true });
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

async function getPolicyConfigAdmin(_req, res, next) {
  try {
    const config = getPolicyConfig();
    return res.status(200).json({ config });
  } catch (err) {
    return next(err);
  }
}

async function replacePolicyConfigAdmin(req, res, next) {
  try {
    const config = replacePolicyConfig(req.body || {});
    return res.status(200).json({ config });
  } catch (err) {
    return next(err);
  }
}

async function addPolicyListEntryAdmin(req, res, next) {
  try {
    const listName = String(req.params.listName || "");
    const value = String(req.body?.value || "");
    const config = addPolicyListEntry(listName, value);
    if (!config) {
      return res.status(400).json({ message: "Invalid list or entry value" });
    }
    return res.status(200).json({ config });
  } catch (err) {
    return next(err);
  }
}

async function updatePolicyListEntryAdmin(req, res, next) {
  try {
    const listName = String(req.params.listName || "");
    const index = Number(req.params.index);
    const value = String(req.body?.value || "");
    const config = updatePolicyListEntry(listName, index, value);
    if (!config) {
      return res.status(400).json({ message: "Invalid list, index, or entry value" });
    }
    return res.status(200).json({ config });
  } catch (err) {
    return next(err);
  }
}

async function deletePolicyListEntryAdmin(req, res, next) {
  try {
    const listName = String(req.params.listName || "");
    const index = Number(req.params.index);
    const config = deletePolicyListEntry(listName, index);
    if (!config) {
      return res.status(400).json({ message: "Invalid list or index" });
    }
    return res.status(200).json({ config });
  } catch (err) {
    return next(err);
  }
}

async function resetPolicyConfigAdmin(_req, res, next) {
  try {
    const config = resetPolicyConfig();
    return res.status(200).json({ config });
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
  createUser,
  updateUser,
  hardDeleteUser,
  getPolicyEvents,
  getPolicySummaryAdmin,
  getPolicyConfigAdmin,
  replacePolicyConfigAdmin,
  addPolicyListEntryAdmin,
  updatePolicyListEntryAdmin,
  deletePolicyListEntryAdmin,
  resetPolicyConfigAdmin,
  getSimulationModules,
  updateSimulationModule
};
