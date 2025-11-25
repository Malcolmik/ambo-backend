import axios from "axios";

// Create Axios instance with new configuration
const sendbird = axios.create({
  baseURL: `https://api-${process.env.SENDBIRD_APP_ID}.sendbird.com/v3`,
  headers: {
    "Content-Type": "application/json; charset=utf8",
    "Api-Token": process.env.SENDBIRD_MASTER_API_TOKEN || process.env.SENDBIRD_API_TOKEN || "",
  },
  timeout: 15000,
});

interface SendbirdUserInput {
  id: string;
  name: string;
  email?: string | null;
}

// 1. Ensure Sendbird User (Updated with avatar logic)
export async function ensureSendbirdUser(user: SendbirdUserInput) {
  const userId = user.id;
  const nickname = user.name || "User";
  const email = user.email ?? undefined;

  // simple avatar URL so profile_url is never empty
  const profileUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    nickname
  )}`;

  try {
    // 1. Check if user already exists
    const existing = await sendbird.get(`/users/${userId}`);
    console.log("[Sendbird] user exists:", existing.data.user_id);
    return existing.data;
  } catch (err: any) {
    const status = err?.response?.status;
    const code = err?.response?.data?.code;
    const message = err?.response?.data?.message;

    console.log("[Sendbird] error checking user:", err?.response?.data || err);

    // Only create if user truly not found (400201 or 404/Not Found generic)
    if ((status === 400 && code === 400201) || status === 404) {
      console.log("[Sendbird] creating user:", userId);

      const body: any = {
        user_id: userId,
        nickname,
        profile_url: profileUrl,   // 🔥 REQUIRED FIELD
      };

      if (email) {
        body.email = email;
      }

      const created = await sendbird.post("/users", body);
      return created.data;
    }

    // any other error -> bubble up
    throw err;
  }
}

// 2. Ensure / create a contract channel (Preserved & Adapted for contracts.handler.ts)
export async function ensureContractChannel(
  contractId: string,
  name: string,
  members: string[],
) {
  const channelUrl = `contract-${contractId}`;

  try {
    const resp = await sendbird.get(`/group_channels/${channelUrl}`);
    console.log("[Sendbird] channel exists:", channelUrl);
    return resp.data;
  } catch (err: any) {
    // If anything other than plain 404 (or Sendbird's 400201), bubble up
    const status = err?.response?.status;
    const code = err?.response?.data?.code;

    if (status !== 404 && code !== 400201) {
      console.error("[Sendbird] error loading channel:", err?.response?.data || err);
      throw err;
    }

    console.log("[Sendbird] creating channel:", channelUrl);

    const resp = await sendbird.post("/group_channels", {
      name,
      channel_url: channelUrl,
      is_distinct: true,
      user_ids: members,
    });

    return resp.data;
  }
}

// 3. Issue Session Token (Updated endpoint and expiry)
export async function issueSendbirdSessionToken(userId: string) {
  // Using the /token endpoint as requested
  const res = await sendbird.post(`/users/${userId}/token`, {
  });
  return res.data.token as string;
}