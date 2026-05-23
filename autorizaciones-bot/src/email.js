import nodemailer from "nodemailer";
import { config, log } from "./config.js";

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.port === 465,
  auth: { user: config.smtp.user, pass: config.smtp.pass },
});

/**
 * Send an email.
 * @param {object} opts
 * @param {string|string[]} opts.to - comma-separated string or array
 * @param {string} [opts.cc]
 * @param {string} opts.subject
 * @param {string} opts.body - plain text
 * @param {Array<{filename:string, content:Buffer, contentType:string}>} [opts.attachments]
 */
export async function sendEmail({ to, cc, subject, body, attachments = [] }) {
  const toList = Array.isArray(to) ? to : to.split(",").map((s) => s.trim()).filter(Boolean);
  const ccList = cc
    ? (Array.isArray(cc) ? cc : cc.split(",").map((s) => s.trim()).filter(Boolean))
    : undefined;

  const info = await transporter.sendMail({
    from: `"${config.smtp.fromName}" <${config.smtp.fromEmail}>`,
    to: toList.join(", "),
    cc: ccList ? ccList.join(", ") : undefined,
    subject,
    text: body,
    attachments,
  });
  log("info", `Email → ${toList.join(", ")} | subject: ${subject} | id: ${info.messageId}`);
  return info;
}

export async function verifySmtp() {
  try {
    await transporter.verify();
    log("info", "SMTP connection OK");
    return true;
  } catch (e) {
    log("error", "SMTP connection failed:", e.message);
    return false;
  }
}
