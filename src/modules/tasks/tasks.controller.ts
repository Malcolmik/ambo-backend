import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthedRequest } from "../../middleware/auth";
import { success, fail } from "../../utils/response";

/**
 * GET /tasks
 * Role behavior:
 *  - SUPER_ADMIN, ADMIN: all tasks
 *  - WORKER: tasks assigned to me
 *  - CLIENT_VIEWER: tasks for my company
 */
export async function listTasks(req: AuthedRequest, res: Response) {
  const role = req.user?.role;
  const userId = req.user?.id;

  if (!role || !userId) return fail(res, "Unauthorized", 401);

  // SUPER_ADMIN and ADMIN see all tasks
  if (role === "SUPER_ADMIN" || role === "ADMIN") {
    const all = await prisma.task.findMany({
      include: {
        client: true,
        assignedTo: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return success(res, all);
  }

  if (role === "WORKER") {
    const mine = await prisma.task.findMany({
      where: { assignedToId: userId },
      include: {
        client: true,
        assignedTo: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: "asc" },
    });
    return success(res, mine);
  }

  if (role === "CLIENT_VIEWER") {
    const client = await prisma.client.findFirst({
      where: { linkedUserId: userId },
    });
    if (!client) return fail(res, "No client", 404);

    const theirs = await prisma.task.findMany({
      where: { clientId: client.id },
      include: {
        client: true,
        assignedTo: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: "asc" },
    });
    return success(res, theirs);
  }

  return fail(res, "Forbidden", 403);
}

/**
 * GET /tasks/my
 * Get all tasks assigned to the logged-in worker
 * Query params: ?status=NOT_STARTED (optional)
 */
export async function getMyTasks(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) return fail(res, "Unauthorized", 401);

    // Only workers can access this endpoint
    if (req.user.role !== "WORKER") {
      return fail(res, "Only workers can access this endpoint", 403);
    }

    const { status } = req.query;

    const where: any = {
      assignedToId: req.user.id,
    };

    if (status) {
      where.status = status;
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
            email: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [
        { priority: "desc" },
        { dueDate: "asc" },
        { createdAt: "desc" },
      ],
    });

    return success(res, tasks);
  } catch (err: any) {
    console.error("getMyTasks error:", err);
    return fail(res, "Failed to fetch tasks", 500);
  }
}

/**
 * GET /tasks/:id
 * Role-aware single fetch
 */
export async function getTask(req: AuthedRequest, res: Response) {
  const { id } = req.params;
  const role = req.user?.role;
  const userId = req.user?.id;

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      client: true,
      assignedTo: { select: { id: true, name: true } },
      comments: {
        include: {
          user: { select: { id: true, name: true, role: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      updates: {
        include: {
          user: { select: { id: true, name: true, role: true } },
        },
        orderBy: { timestamp: "asc" },
      },
    },
  });

  if (!task) return fail(res, "Task not found", 404);

  // SUPER_ADMIN and ADMIN can see all tasks
  if (role === "SUPER_ADMIN" || role === "ADMIN") return success(res, task);

  if (role === "WORKER") {
    if (task.assignedToId === userId) return success(res, task);
    return fail(res, "Forbidden", 403);
  }

  if (role === "CLIENT_VIEWER") {
    const client = await prisma.client.findFirst({
      where: { linkedUserId: userId },
    });
    if (client && task.clientId === client.id) return success(res, task);
    return fail(res, "Forbidden", 403);
  }

  return fail(res, "Forbidden", 403);
}

/**
 * POST /tasks
 * SUPER_ADMIN and ADMIN can create tasks, assign worker & client
 * 
 * V3 UPDATE: Auto-priority logic
 * - If linked to a contract = CRITICAL (package work)
 * - If standalone (no contract) = PRIORITY
 * - Can override with forcePriority: true
 */
export async function createTask(req: AuthedRequest, res: Response) {
  try {
    const {
      title,
      description,
      priority,        // Will be overridden by auto-logic unless forcePriority is true
      dueDate,
      clientId,
      contractId,      // V3: Can be linked directly to a contract
      assignedToId,
      requiresApproval,
      forcePriority,   // V3: If true, use the provided priority instead of auto
    } = req.body;

    // validate clientId if provided
    if (clientId) {
      const clientExists = await prisma.client.findUnique({
        where: { id: clientId },
        select: { id: true },
      });
      if (!clientExists) {
        return fail(res, "Invalid clientId: client does not exist", 400);
      }
    }

    // V3: Validate contractId if provided
    let linkedContract = null;
    if (contractId) {
      linkedContract = await prisma.contract.findUnique({
        where: { id: contractId },
        select: { id: true, clientId: true },
      });
      if (!linkedContract) {
        return fail(res, "Invalid contractId: contract does not exist", 400);
      }
    }

    // validate assignedToId if provided
    if (assignedToId) {
      const workerExists = await prisma.user.findUnique({
        where: { id: assignedToId },
        select: { id: true, role: true },
      });
      if (!workerExists || workerExists.role !== "WORKER") {
        return fail(res, "Invalid assignedToId: worker not found", 400);
      }
    }

    // V3: AUTO-PRIORITY LOGIC
    // If linked to a contract = CRITICAL (package work)
    // If standalone (no contract) = PRIORITY
    let taskPriority = priority || "PRIORITY"; // Default for standalone
    
    if (!forcePriority) {
      if (contractId || linkedContract) {
        // Linked to a contract = CRITICAL
        taskPriority = "CRITICAL";
      } else if (!priority) {
        // No priority specified and no contract = PRIORITY
        taskPriority = "PRIORITY";
      }
    }

    // V3: Determine clientId - use contract's client if contractId provided but no clientId
    const finalClientId = clientId || linkedContract?.clientId || null;

    // create task
    const created = await prisma.task.create({
      data: {
        title,
        description,
        priority: taskPriority,
        dueDate: dueDate ? new Date(dueDate) : null,
        clientId: finalClientId,
        contractId: contractId || null,
        assignedToId: assignedToId || null,
        requiresApproval: !!requiresApproval,
        createdById: req.user!.id,
      },
    });

    // audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        actionType: "TASK_CREATED",
        entityType: "TASK",
        entityId: created.id,
        metaJson: created as any,
      },
    });

    return success(res, created, 201);
  } catch (err) {
    console.error("createTask error:", err);
    return fail(res, "Task creation failed", 500);
  }
}

/**
 * PATCH /tasks/:id
 * General update to fields on a task.
 * - SUPER_ADMIN and ADMIN can update anything
 * - WORKER can only update tasks assigned to them
 *
 * V3 UPDATE: Auto-priority when contractId changes
 * - When contractId is added = auto-set CRITICAL
 * - When contractId is removed = auto-set PRIORITY
 * - Can override with forcePriority: true
 *
 * Supports updating:
 *   status, title, description, priority, dueDate, assignedToId, contractId
 *
 * Also logs status changes into taskUpdate + auditLog.
 */
export async function updateTask(req: AuthedRequest, res: Response) {
  try {
    const { id } = req.params;
    const {
      status,
      title,
      description,
      priority,
      dueDate,
      assignedToId,
      contractId,      // V3: Can link/unlink contract
      forcePriority,   // V3: Override auto-priority
    } = req.body;

    // 1. Load current task
    const task = await prisma.task.findUnique({
      where: { id },
    });
    if (!task) {
      return fail(res, "Task not found", 404);
    }

    // 2. Permission check - ADMIN also allowed
    const isAdmin = req.user?.role === "SUPER_ADMIN" || req.user?.role === "ADMIN";
    const isAssignedWorker = req.user?.id === task.assignedToId;

    if (!isAdmin && !isAssignedWorker) {
      return fail(res, "Forbidden", 403);
    }

    // 3. Validate reassignment if changing assignedToId
    let nextAssignedToId = task.assignedToId;
    if (assignedToId && assignedToId !== task.assignedToId) {
      // only SUPER_ADMIN or ADMIN can reassign
      if (!isAdmin) {
        return fail(res, "Only SUPER_ADMIN or ADMIN can reassign tasks", 403);
      }

      const workerExists = await prisma.user.findUnique({
        where: { id: assignedToId },
        select: { id: true, role: true },
      });

      if (!workerExists || workerExists.role !== "WORKER") {
        return fail(res, "Invalid assignedToId: worker not found", 400);
      }

      nextAssignedToId = assignedToId;
    }

    // V3: Handle contractId changes and auto-priority
    let nextPriority = priority ?? task.priority;
    let nextContractId = task.contractId;

    if (contractId !== undefined && isAdmin) {
      // Validate contractId if provided
      if (contractId) {
        const contractExists = await prisma.contract.findUnique({
          where: { id: contractId },
          select: { id: true },
        });
        if (!contractExists) {
          return fail(res, "Invalid contractId: contract does not exist", 400);
        }
      }

      nextContractId = contractId;
      
      // V3: Auto-update priority unless forcePriority is set
      if (!forcePriority && !priority) {
        if (contractId) {
          // Linking to contract = CRITICAL
          nextPriority = "CRITICAL";
        } else {
          // Unlinking from contract = PRIORITY
          nextPriority = "PRIORITY";
        }
      }
    }

    // 4. Build update payload safely
    const updated = await prisma.task.update({
      where: { id },
      data: {
        status: status ?? task.status,
        title: title ?? task.title,
        description: description ?? task.description,
        priority: nextPriority,
        dueDate: dueDate ? new Date(dueDate) : task.dueDate,
        assignedToId: nextAssignedToId,
        contractId: nextContractId,
      },
    });

    // 5. If status changed, log taskUpdate + auditLog
    if (status && status !== task.status) {
      await prisma.taskUpdate.create({
        data: {
          taskId: id,
          userId: req.user!.id,
          oldStatus: task.status,
          newStatus: status,
          message: "Status updated via updateTask",
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          actionType: "TASK_STATUS_CHANGE",
          entityType: "TASK",
          entityId: id,
          metaJson: {
            oldStatus: task.status,
            newStatus: status,
          } as any,
        },
      });
    }

    return success(res, updated);
  } catch (err) {
    console.error("updateTask error:", err);
    return fail(res, "Task update failed", 500);
  }
}

/**
 * PATCH /tasks/:id/status
 * Quick status/progress update with message/attachment.
 * This is basically your "progress log" endpoint.
 */
export async function updateTaskStatus(req: AuthedRequest, res: Response) {
  const { id } = req.params;
  const { newStatus, message, attachmentUrl } = req.body;

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return fail(res, "Task not found", 404);

  // SUPER_ADMIN, ADMIN, or assigned worker can push status
  if (
    req.user?.role !== "SUPER_ADMIN" &&
    req.user?.role !== "ADMIN" &&
    req.user?.id !== task.assignedToId
  ) {
    return fail(res, "Forbidden", 403);
  }

  const updatedTask = await prisma.task.update({
    where: { id },
    data: {
      status: newStatus ?? task.status,
    },
  });

  await prisma.taskUpdate.create({
    data: {
      taskId: id,
      userId: req.user!.id,
      oldStatus: task.status,
      newStatus: newStatus ?? task.status,
      message,
      attachmentUrl,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      actionType: "TASK_STATUS_CHANGE",
      entityType: "TASK",
      entityId: id,
      metaJson: {
        oldStatus: task.status,
        newStatus: newStatus ?? task.status,
        message,
      } as any,
    },
  });

  return success(res, updatedTask);
}

/**
 * POST /tasks/:taskId/accept
 * Worker accepts an assigned task
 */
export async function acceptTask(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) return fail(res, "Unauthorized", 401);

    if (req.user.role !== "WORKER") {
      return fail(res, "Only workers can accept tasks", 403);
    }

    const { taskId } = req.params;

    // Find the task
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        client: { include: { linkedUser: true } },
        assignedTo: true,
      },
    });

    if (!task) {
      return fail(res, "Task not found", 404);
    }

    // Verify the task is assigned to this worker
    if (task.assignedToId !== req.user.id) {
      return fail(res, "This task is not assigned to you", 403);
    }

    // Verify task is in correct status
    if (task.status !== "NOT_STARTED") {
      return fail(res, `Task is already in ${task.status} status`, 400);
    }

    // Update task status
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        status: "IN_PROGRESS",
        updatedAt: new Date(),
      },
      include: {
        client: true,
        assignedTo: true,
      },
    });

    // Notify client
    if (task.client?.linkedUser) {
      await prisma.notification.create({
        data: {
          userId: task.client.linkedUser.id,
          type: "TASK_ACCEPTED",
          title: "Task Accepted",
          body: `${task.assignedTo?.name || 'A worker'} has accepted your task: ${task.title}`,
        },
      });
    }

    // Notify admin (both SUPER_ADMIN and ADMIN)
    const admins = await prisma.user.findMany({
      where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, active: true },
      select: { id: true },
    });

    for (const admin of admins) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          type: "TASK_ACCEPTED",
          title: "Task Accepted",
          body: `${task.assignedTo?.name || 'Worker'} accepted task: ${task.title}${task.client ? ` for ${task.client.companyName}` : ''}`,
        },
      });
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        actionType: "TASK_ACCEPTED",
        entityType: "TASK",
        entityId: taskId,
        metaJson: {
          taskTitle: task.title,
          clientId: task.clientId || null,
        } as any,
      },
    });

    return success(res, {
      task: updatedTask,
      message: "Task accepted successfully",
    });
  } catch (err: any) {
    console.error("acceptTask error:", err);
    return fail(res, "Failed to accept task", 500);
  }
}

/**
 * POST /tasks/:taskId/decline
 * Worker declines an assigned task
 * Body: { reason: string }
 */
export async function declineTask(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) return fail(res, "Unauthorized", 401);

    if (req.user.role !== "WORKER") {
      return fail(res, "Only workers can decline tasks", 403);
    }

    const { taskId } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return fail(res, "Decline reason is required", 400);
    }

    // Find the task
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        client: true,
        assignedTo: true,
      },
    });

    if (!task) {
      return fail(res, "Task not found", 404);
    }

    // Verify the task is assigned to this worker
    if (task.assignedToId !== req.user.id) {
      return fail(res, "This task is not assigned to you", 403);
    }

    // Update task - set assignedTo to null and add decline reason in meta
    const taskWithMeta = task as any;
    const currentMeta = (taskWithMeta.meta as Record<string, any>) || {};
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        assignedToId: null, // Unassign the worker
        meta: {
          ...currentMeta,
          declined: true,
          declinedBy: req.user.id,
          declinedByName: req.user.name,
          declineReason: reason,
          declinedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      } as any,
      include: {
        client: true,
      },
    });

    // Notify all admins about the decline (both SUPER_ADMIN and ADMIN)
    const admins = await prisma.user.findMany({
      where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, active: true },
      select: { id: true },
    });

    for (const admin of admins) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          type: "TASK_DECLINED",
          title: "Task Declined - Action Required",
          body: `${task.assignedTo?.name || 'Worker'} declined task: ${task.title}${task.client ? ` for ${task.client.companyName}` : ''}. Reason: ${reason}`,
        },
      });
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        actionType: "TASK_DECLINED",
        entityType: "TASK",
        entityId: taskId,
        metaJson: {
          taskTitle: task.title,
          clientId: task.clientId || null,
          reason,
        } as any,
      },
    });

    return success(res, {
      task: updatedTask,
      message: "Task declined. Admin has been notified.",
    });
  } catch (err: any) {
    console.error("declineTask error:", err);
    return fail(res, "Failed to decline task", 500);
  }
}

/**
 * POST /tasks/:taskId/complete
 * Worker marks task as complete
 * Body: { notes?: string }
 */
export async function completeTask(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) return fail(res, "Unauthorized", 401);

    if (req.user.role !== "WORKER") {
      return fail(res, "Only workers can complete tasks", 403);
    }

    const { taskId } = req.params;
    const { notes } = req.body;

    // Find the task
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        client: { include: { linkedUser: true } },
        assignedTo: true,
      },
    });

    if (!task) {
      return fail(res, "Task not found", 404);
    }

    // Verify the task is assigned to this worker
    if (task.assignedToId !== req.user.id) {
      return fail(res, "This task is not assigned to you", 403);
    }

    // Verify task is in progress
    if (task.status !== "IN_PROGRESS" && task.status !== "WAITING") {
      return fail(res, `Task must be IN_PROGRESS to mark as complete (currently ${task.status})`, 400);
    }

    // Update task status
    const taskWithMeta = task as any;
    const currentMeta = (taskWithMeta.meta as Record<string, any>) || {};
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        status: "DONE",
        meta: {
          ...currentMeta,
          completionNotes: notes || "",
          completedAt: new Date().toISOString(),
          completedBy: req.user.id,
        },
        updatedAt: new Date(),
      } as any,
      include: {
        client: true,
        assignedTo: true,
      },
    });

    // Notify client
    if (task.client?.linkedUser) {
      await prisma.notification.create({
        data: {
          userId: task.client.linkedUser.id,
          type: "TASK_COMPLETED",
          title: "Task Completed",
          body: `${task.assignedTo?.name || 'Your worker'} completed your task: ${task.title}${notes ? `. Notes: ${notes}` : ""}`,
        },
      });
    }

    // Notify admin (both SUPER_ADMIN and ADMIN)
    const admins = await prisma.user.findMany({
      where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, active: true },
      select: { id: true },
    });

    for (const admin of admins) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          type: "TASK_COMPLETED",
          title: "Task Completed",
          body: `${task.assignedTo?.name || 'Worker'} completed task: ${task.title}${task.client ? ` for ${task.client.companyName}` : ''}`,
        },
      });
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        actionType: "TASK_COMPLETED",
        entityType: "TASK",
        entityId: taskId,
        metaJson: {
          taskTitle: task.title,
          clientId: task.clientId || null,
          notes: notes || "",
        } as any,
      },
    });

    return success(res, {
      task: updatedTask,
      message: "Task marked as complete. Client and admin have been notified.",
    });
  } catch (err: any) {
    console.error("completeTask error:", err);
    return fail(res, "Failed to complete task", 500);
  }
}