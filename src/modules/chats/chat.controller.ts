import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthedRequest } from "../../middleware/auth";
import { success, fail } from "../../utils/response";
import { sendNewMessageEmail } from "../../services/email.service";

/**
 * PATCH /api/chats/:channelId/read
 * Mark all messages in a channel as read
 */
export async function markChannelAsRead(req: AuthedRequest, res: Response) {
  try {
    const { channelId } = req.params;

    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    const channel = await prisma.chatChannel.findUnique({
      where: { id: channelId },
      include: {
        client: { select: { linkedUserId: true } },
      },
    });

    if (!channel) {
      return fail(res, "Chat channel not found", 404);
    }

    const hasAccess =
      req.user.role === "SUPER_ADMIN" ||
      channel.workerId === req.user.id ||
      channel.client.linkedUserId === req.user.id;

    if (!hasAccess) {
      return fail(res, "Access denied to this chat", 403);
    }

    await prisma.message.updateMany({
      where: {
        channelId,
        senderId: { not: req.user.id },
        read: false,
      },
      data: {
        read: true,
        readAt: new Date(),
      },
    });

    return success(res, { message: "Messages marked as read" });
  } catch (err: any) {
    console.error("markChannelAsRead error:", err);
    return fail(res, "Failed to mark messages as read", 500);
  }
}

/**
 * GET /api/chats/available-contacts
 * Get list of users/clients the authenticated user can chat with
 */
export async function getAvailableContacts(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    console.log(`[available-contacts] User: ${req.user.id}, Role: ${req.user.role}`);

    if (req.user.role === "SUPER_ADMIN") {
      // Admin can chat with ALL clients that have a linked user
      const clients = await prisma.client.findMany({
        where: {
          linkedUserId: { not: null },
        },
        include: {
          linkedUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { companyName: "asc" },
      });

      const contacts = clients.map((client) => ({
        id: client.id,
        name: client.companyName || client.contactPerson,
        email: client.linkedUser?.email,
        companyName: client.companyName,
        contactPerson: client.contactPerson,
        logoUrl: client.logoUrl,
        userId: client.linkedUserId,
        type: "client",
      }));

      console.log(`[available-contacts] Admin sees ${contacts.length} clients`);
      return success(res, { contacts });

    } else if (req.user.role === "WORKER") {
      // Worker sees clients from their assigned tasks
      
      // Method 1: Find clients directly through tasks with clientId
      const tasksWithClients = await prisma.task.findMany({
        where: {
          assignedToId: req.user.id,
          clientId: { not: null },
        },
        include: {
          client: {
            include: {
              linkedUser: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      });

      console.log(`[available-contacts] Worker has ${tasksWithClients.length} tasks with clients`);

      // Method 2: Find clients through contract->tasks
      const contractsWithTasks = await prisma.contract.findMany({
        where: {
          tasks: {
            some: {
              assignedToId: req.user.id,
            },
          },
        },
        include: {
          client: {
            include: {
              linkedUser: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      });

      console.log(`[available-contacts] Worker has ${contractsWithTasks.length} contracts with assigned tasks`);

      // Combine both methods
      const clientMap = new Map();

      // Add clients from direct task assignments
      tasksWithClients.forEach((task) => {
        if (task.client && task.client.linkedUserId) {
          clientMap.set(task.client.id, task.client);
        }
      });

      // Add clients from contract assignments
      contractsWithTasks.forEach((contract) => {
        if (contract.client && contract.client.linkedUserId) {
          clientMap.set(contract.client.id, contract.client);
        }
      });

      const uniqueClients = Array.from(clientMap.values());

      const contacts = uniqueClients.map((client) => ({
        id: client.id,
        name: client.companyName || client.contactPerson,
        email: client.linkedUser?.email,
        companyName: client.companyName,
        contactPerson: client.contactPerson,
        logoUrl: client.logoUrl,
        userId: client.linkedUserId,
        type: "client",
      }));

      console.log(`[available-contacts] Worker can chat with ${contacts.length} clients`);
      return success(res, { contacts });

    } else if (req.user.role === "CLIENT_VIEWER") {
      // Client sees workers assigned to their tasks
      const client = await prisma.client.findFirst({
        where: { linkedUserId: req.user.id },
      });

      if (!client) {
        console.log(`[available-contacts] No client found for user ${req.user.id}`);
        return success(res, { contacts: [] });
      }

      // Find workers from tasks assigned to this client
      const tasksWithWorkers = await prisma.task.findMany({
        where: {
          clientId: client.id,
          assignedToId: { not: null },
        },
        include: {
          assignedTo: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      // Also check tasks through contracts
      const contractTasks = await prisma.task.findMany({
        where: {
          contract: {
            clientId: client.id,
          },
          assignedToId: { not: null },
        },
        include: {
          assignedTo: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      // Combine and deduplicate workers
      const workerMap = new Map();

      [...tasksWithWorkers, ...contractTasks].forEach((task) => {
        if (task.assignedTo) {
          workerMap.set(task.assignedTo.id, task.assignedTo);
        }
      });

      const contacts = Array.from(workerMap.values()).map((worker) => ({
        id: worker.id,
        name: worker.name,
        email: worker.email,
        type: "worker",
      }));

      // Also add super admins so clients can reach support
      const admins = await prisma.user.findMany({
        where: { role: "SUPER_ADMIN" },
        select: {
          id: true,
          name: true,
          email: true,
        },
      });

      admins.forEach((admin) => {
        contacts.push({
          id: admin.id,
          name: admin.name || "AMBO Support",
          email: admin.email,
          type: "admin",
        });
      });

      console.log(`[available-contacts] Client can chat with ${contacts.length} contacts`);
      return success(res, { contacts });

    } else {
      return success(res, { contacts: [] });
    }
  } catch (err: any) {
    console.error("getAvailableContacts error:", err);
    return fail(res, "Failed to get available contacts", 500);
  }
}

/**
 * POST /api/chats/start
 * Start a chat with a contact (creates channel if doesn't exist)
 */
export async function startChat(req: AuthedRequest, res: Response) {
  try {
    const { contactId, message } = req.body;

    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (!contactId) {
      return fail(res, "Contact ID is required", 400);
    }

    console.log(`[startChat] User: ${req.user.id}, Role: ${req.user.role}, ContactId: ${contactId}`);

    let clientId: string;
    let workerId: string | null = null;

    if (req.user.role === "SUPER_ADMIN") {
      // Admin starting chat with a client
      // contactId is the client ID
      clientId = contactId;
      workerId = null; // Admin chats don't have a specific worker
      
    } else if (req.user.role === "WORKER") {
      // Worker starting chat with a client
      // contactId is the client ID
      clientId = contactId;
      workerId = req.user.id;
      
    } else if (req.user.role === "CLIENT_VIEWER") {
      // Client starting chat with a worker or admin
      // contactId is the user ID (worker or admin)
      
      // First, get the client record for this user
      const client = await prisma.client.findFirst({
        where: { linkedUserId: req.user.id },
      });

      if (!client) {
        return fail(res, "Client record not found", 404);
      }

      clientId = client.id;
      
      // Check if the contact is an admin or worker
      const contactUser = await prisma.user.findUnique({
        where: { id: contactId },
      });

      if (!contactUser) {
        return fail(res, "Contact not found", 404);
      }

      if (contactUser.role === "WORKER") {
        workerId = contactId;
      } else {
        // Admin chat - no specific worker
        workerId = null;
      }
    } else {
      return fail(res, "Unauthorized role", 403);
    }

    console.log(`[startChat] Looking for channel: clientId=${clientId}, workerId=${workerId}`);

    // Check if channel already exists
    const existingChannel = await prisma.chatChannel.findFirst({
      where: {
        clientId,
        workerId,
      },
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
            contactPerson: true,
            logoUrl: true,
          },
        },
        worker: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (existingChannel) {
      console.log(`[startChat] Found existing channel: ${existingChannel.id}`);
      
      // If there's an initial message, send it
      if (message && message.trim()) {
        await prisma.message.create({
          data: {
            channelId: existingChannel.id,
            senderId: req.user.id,
            content: message.trim(),
          },
        });

        await prisma.chatChannel.update({
          where: { id: existingChannel.id },
          data: { lastMessageAt: new Date() },
        });
      }

      return success(res, { channel: existingChannel, created: false });
    }

    // Create new channel
    console.log(`[startChat] Creating new channel`);
    const newChannel = await prisma.chatChannel.create({
      data: {
        clientId,
        workerId,
      },
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
            contactPerson: true,
            logoUrl: true,
          },
        },
        worker: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    console.log(`[startChat] Created channel: ${newChannel.id}`);

    // If there's an initial message, send it
    if (message && message.trim()) {
      await prisma.message.create({
        data: {
          channelId: newChannel.id,
          senderId: req.user.id,
          content: message.trim(),
        },
      });

      await prisma.chatChannel.update({
        where: { id: newChannel.id },
        data: { lastMessageAt: new Date() },
      });
    }

    return success(res, { channel: newChannel, created: true });
  } catch (err: any) {
    console.error("startChat error:", err);
    return fail(res, "Failed to start chat", 500);
  }
}

/**
 * GET /api/chats
 */
export async function getUserChats(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) return fail(res, "Unauthorized", 401);

    let channels;

    const commonInclude = {
      client: {
        select: {
          id: true,
          companyName: true,
          contactPerson: true,
          logoUrl: true,
        },
      },
      worker: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      messages: {
        orderBy: { createdAt: "desc" as const },
        take: 1,
        include: {
          sender: { select: { id: true, name: true } },
        },
      },
      _count: {
        select: {
          messages: {
            where: {
              read: false,
              senderId: { not: req.user.id },
            },
          },
        },
      },
    };

    if (req.user.role === "SUPER_ADMIN") {
      channels = await prisma.chatChannel.findMany({
        include: commonInclude,
        orderBy: { lastMessageAt: "desc" },
      });
    } else if (req.user.role === "WORKER") {
      channels = await prisma.chatChannel.findMany({
        where: { workerId: req.user.id },
        include: commonInclude,
        orderBy: { lastMessageAt: "desc" },
      });
    } else {
      const client = await prisma.client.findFirst({
        where: { linkedUserId: req.user.id },
      });
      if (!client) return success(res, { channels: [] });

      channels = await prisma.chatChannel.findMany({
        where: { clientId: client.id },
        include: commonInclude,
        orderBy: { lastMessageAt: "desc" },
      });
    }

    const formattedChannels = channels.map((channel) => ({
      id: channel.id,
      client: channel.client,
      worker: channel.worker,
      lastMessage: channel.messages[0] || null,
      unreadCount: channel._count.messages,
      lastMessageAt: channel.lastMessageAt,
      createdAt: channel.createdAt,
    }));

    return success(res, { channels: formattedChannels });
  } catch (err: any) {
    console.error("getUserChats error:", err);
    return fail(res, "Failed to retrieve chats", 500);
  }
}

/**
 * GET /api/chats/:channelId/messages
 */
export async function getChannelMessages(req: AuthedRequest, res: Response) {
  try {
    const { channelId } = req.params;
    if (!req.user) return fail(res, "Unauthorized", 401);

    const channel = await prisma.chatChannel.findUnique({
      where: { id: channelId },
      include: {
        client: { select: { linkedUserId: true } },
      },
    });

    if (!channel) return fail(res, "Chat channel not found", 404);

    const hasAccess =
      req.user.role === "SUPER_ADMIN" ||
      channel.workerId === req.user.id ||
      channel.client.linkedUserId === req.user.id;

    if (!hasAccess) return fail(res, "Access denied", 403);

    const messages = await prisma.message.findMany({
      where: { channelId },
      include: {
        sender: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    // Mark as read
    await prisma.message.updateMany({
      where: {
        channelId,
        senderId: { not: req.user.id },
        read: false,
      },
      data: { read: true, readAt: new Date() },
    });

    return success(res, { messages });
  } catch (err: any) {
    console.error("getChannelMessages error:", err);
    return fail(res, "Failed to retrieve messages", 500);
  }
}

/**
 * POST /api/chats/:channelId/messages
 */
export async function sendMessage(req: AuthedRequest, res: Response) {
  try {
    const { channelId } = req.params;
    const { content } = req.body;

    if (!req.user) return fail(res, "Unauthorized", 401);
    if (!content || content.trim().length === 0) return fail(res, "Message required", 400);

    const channel = await prisma.chatChannel.findUnique({
      where: { id: channelId },
      include: {
        client: {
          select: {
            id: true,
            linkedUserId: true,
            linkedUser: { select: { email: true, name: true } },
          },
        },
        worker: { select: { id: true, name: true, email: true } },
      },
    });

    if (!channel) return fail(res, "Chat channel not found", 404);

    const hasAccess =
      req.user.role === "SUPER_ADMIN" ||
      channel.workerId === req.user.id ||
      channel.client.linkedUserId === req.user.id;

    if (!hasAccess) return fail(res, "Access denied", 403);

    const message = await prisma.message.create({
      data: {
        channelId,
        senderId: req.user.id,
        content: content.trim(),
      },
      include: {
        sender: { select: { id: true, name: true, role: true } },
      },
    });

    await prisma.chatChannel.update({
      where: { id: channelId },
      data: { lastMessageAt: new Date() },
    });

    // Determine recipient for notifications
    const recipientEmail =
      req.user.id === channel.client.linkedUserId
        ? channel.worker?.email
        : channel.client.linkedUser?.email;

    const recipientName =
      req.user.id === channel.client.linkedUserId
        ? channel.worker?.name
        : channel.client.linkedUser?.name;

    const recipientId =
      req.user.id === channel.client.linkedUserId
        ? channel.workerId
        : channel.client.linkedUserId;

    if (recipientEmail && recipientName) {
      try {
        const chatUrl = `${process.env.FRONTEND_URL || "https://ambo-dash.lovable.app"}/messages/${channelId}`;
        await sendNewMessageEmail(
          recipientEmail,
          recipientName,
          req.user.name,
          content,
          chatUrl
        );
      } catch (emailError) {
        console.error("Email notification failed:", emailError);
      }
    }

    if (recipientId) {
      await prisma.notification.create({
        data: {
          userId: recipientId,
          type: "NEW_MESSAGE",
          title: "New Message",
          body: `${req.user.name}: ${content.substring(0, 30)}...`,
          read: false,
        },
      });
    }

    return success(res, { message });
  } catch (err: any) {
    console.error("sendMessage error:", err);
    return fail(res, "Failed to send message", 500);
  }
}

/**
 * POST /api/chats/create
 */
export async function createOrGetChannel(req: AuthedRequest, res: Response) {
  try {
    const { clientId, workerId } = req.body;
    if (!req.user) return fail(res, "Unauthorized", 401);
    
    // Only admins/workers can manually create
    if (req.user.role !== "SUPER_ADMIN" && req.user.role !== "WORKER") {
      return fail(res, "Permission denied", 403);
    }

    if (!clientId) return fail(res, "Client ID required", 400);

    const existing = await prisma.chatChannel.findFirst({
      where: { clientId, workerId: workerId || null },
      include: {
        client: { select: { id: true, companyName: true, logoUrl: true } },
        worker: { select: { id: true, name: true, email: true } },
      },
    });

    if (existing) return success(res, { channel: existing, created: false });

    const channel = await prisma.chatChannel.create({
      data: { clientId, workerId: workerId || null },
      include: {
        client: { select: { id: true, companyName: true, logoUrl: true } },
        worker: { select: { id: true, name: true, email: true } },
      },
    });

    return success(res, { channel, created: true });
  } catch (err: any) {
    console.error("createOrGetChannel error:", err);
    return fail(res, "Failed to create chat channel", 500);
  }
}

/**
 * GET /api/chats/unread-count
 */
export async function getUnreadCount(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) return fail(res, "Unauthorized", 401);

    let channelIds: string[] = [];

    if (req.user.role === "SUPER_ADMIN") {
      const channels = await prisma.chatChannel.findMany({ select: { id: true } });
      channelIds = channels.map((c) => c.id);
    } else if (req.user.role === "WORKER") {
      const channels = await prisma.chatChannel.findMany({
        where: { workerId: req.user.id },
        select: { id: true },
      });
      channelIds = channels.map((c) => c.id);
    } else {
      const client = await prisma.client.findFirst({
        where: { linkedUserId: req.user.id },
      });
      if (client) {
        const channels = await prisma.chatChannel.findMany({
          where: { clientId: client.id },
          select: { id: true },
        });
        channelIds = channels.map((c) => c.id);
      }
    }

    const unreadCount = await prisma.message.count({
      where: {
        channelId: { in: channelIds },
        senderId: { not: req.user.id },
        read: false,
      },
    });

    return success(res, { unreadCount });
  } catch (err: any) {
    console.error("getUnreadCount error:", err);
    return fail(res, "Failed to get unread count", 500);
  }
}
