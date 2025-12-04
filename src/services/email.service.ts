import { Resend } from "resend";

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@ambo.app";
const FROM_NAME = process.env.FROM_NAME || "AMBO";

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  toEmail: string,
  userName: string,
  resetUrl: string
): Promise<void> {
  try {
    await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: toEmail,
      subject: "Reset Your Password",
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Reset Your Password</title>
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 10px;">
              <h1 style="color: #2563eb; margin-top: 0;">Reset Your Password</h1>
              <p>Hi ${userName},</p>
              <p>We received a request to reset your password for your AMBO account.</p>
              <p>Click the button below to reset your password:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Reset Password</a>
              </div>
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #2563eb;">${resetUrl}</p>
              <p style="color: #666; font-size: 14px; margin-top: 30px;">
                <strong>This link will expire in 1 hour.</strong>
              </p>
              <p style="color: #666; font-size: 14px;">
                If you didn't request this password reset, please ignore this email or contact support if you have concerns.
              </p>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
              <p style="color: #999; font-size: 12px; text-align: center;">
                © ${new Date().getFullYear()} AMBO. All rights reserved.
              </p>
            </div>
          </body>
        </html>
      `,
    });
  } catch (error) {
    console.error("Error sending password reset email:", error);
    throw new Error("Failed to send password reset email");
  }
}


/**
 * Send new message notification email
 */
export async function sendNewMessageEmail(
  toEmail: string,
  recipientName: string,
  senderName: string,
  messagePreview: string,
  chatUrl: string
): Promise<void> {
  try {
    await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: toEmail,
      subject: `New Message from ${senderName}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>New Message</title>
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 10px;">
              <h1 style="color: #2563eb; margin-top: 0;">💬 New Message</h1>
              <p>Hi ${recipientName},</p>
              <p><strong>${senderName}</strong> sent you a message:</p>
              <div style="background-color: white; padding: 15px; border-left: 4px solid #2563eb; border-radius: 5px; margin: 20px 0;">
                <p style="margin: 0; color: #555;">${messagePreview.substring(0, 150)}${messagePreview.length > 150 ? "..." : ""}</p>
              </div>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${chatUrl}" style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">View Message</a>
              </div>
              <p style="color: #666; font-size: 14px;">
                Reply directly in the AMBO platform to continue the conversation.
              </p>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
              <p style="color: #999; font-size: 12px; text-align: center;">
                © ${new Date().getFullYear()} AMBO. All rights reserved.
              </p>
            </div>
          </body>
        </html>
      `,
    });
  } catch (error) {
    console.error("Error sending new message email:", error);
    throw new Error("Failed to send new message email");
  }
}

/**
 * Send welcome email to new user
 */
export async function sendWelcomeEmail(
  toEmail: string,
  userName: string,
  loginUrl: string
): Promise<void> {
  try {
    await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: toEmail,
      subject: "Welcome to AMBO!",
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Welcome to AMBO</title>
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 10px;">
              <h1 style="color: #2563eb; margin-top: 0;">Welcome to AMBO!</h1>
              <p>Hi ${userName},</p>
              <p>Your account has been created successfully. We're excited to have you on board!</p>
              <p>You can now log in to your account and start exploring:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${loginUrl}" style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Log In to Your Account</a>
              </div>
              <p>If you have any questions, feel free to reach out to our support team.</p>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
              <p style="color: #999; font-size: 12px; text-align: center;">
                © ${new Date().getFullYear()} AMBO. All rights reserved.
              </p>
            </div>
          </body>
        </html>
      `,
    });
  } catch (error) {
    console.error("Error sending welcome email:", error);
    throw new Error("Failed to send welcome email");
  }
}

/**
 * Send payment confirmation email
 */
export async function sendPaymentConfirmationEmail(
  toEmail: string,
  userName: string,
  amount: number,
  packageType: string,
  dashboardUrl: string
): Promise<void> {
  try {
    await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: toEmail,
      subject: "Payment Confirmed - AMBO",
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Payment Confirmed</title>
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 10px;">
              <h1 style="color: #10b981; margin-top: 0;">✓ Payment Confirmed</h1>
              <p>Hi ${userName},</p>
              <p>Thank you for your payment! Your transaction has been successfully processed.</p>
              <div style="background-color: white; padding: 20px; border-radius: 5px; margin: 20px 0;">
                <h3 style="margin-top: 0;">Payment Details</h3>
                <p><strong>Package:</strong> ${packageType}</p>
                <p><strong>Amount:</strong> ₦${amount.toLocaleString()}</p>
              </div>
              <p>Your project is now being set up. You'll receive another notification once everything is ready.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${dashboardUrl}" style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Go to Dashboard</a>
              </div>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
              <p style="color: #999; font-size: 12px; text-align: center;">
                © ${new Date().getFullYear()} AMBO. All rights reserved.
              </p>
            </div>
          </body>
        </html>
      `,
    });
  } catch (error) {
    console.error("Error sending payment confirmation email:", error);
    throw new Error("Failed to send payment confirmation email");
  }
}

/**
 * Send task assignment notification email
 */
export async function sendTaskAssignmentEmail(
  toEmail: string,
  workerName: string,
  taskTitle: string,
  clientName: string,
  dashboardUrl: string
): Promise<void> {
  try {
    await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: toEmail,
      subject: `New Task Assigned: ${taskTitle}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>New Task Assigned</title>
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 10px;">
              <h1 style="color: #2563eb; margin-top: 0;">📋 New Task Assigned</h1>
              <p>Hi ${workerName},</p>
              <p>You have been assigned a new task:</p>
              <div style="background-color: white; padding: 20px; border-radius: 5px; margin: 20px 0;">
                <h3 style="margin-top: 0;">${taskTitle}</h3>
                <p><strong>Client:</strong> ${clientName}</p>
              </div>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${dashboardUrl}" style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">View Task Details</a>
              </div>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
              <p style="color: #999; font-size: 12px; text-align: center;">
                © ${new Date().getFullYear()} AMBO. All rights reserved.
              </p>
            </div>
          </body>
        </html>
      `,
    });
  } catch (error) {
    console.error("Error sending task assignment email:", error);
    throw new Error("Failed to send task assignment email");
  }
}
