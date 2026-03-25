import { subscribeToQueue } from "./rabbit.js";
import sendEmail from "../utils/email.util.js";

function startListener() {
    subscribeToQueue("user_created", async (msg) => {
        const { email, fullName: { firstName, lastName } } = msg;

        const template = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Welcome to Colearn</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6fb;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6fb;padding:40px 0;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
                    
                    <!-- Header -->
                    <tr>
                        <td style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:40px 48px;text-align:center;">
                            <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:-0.5px;">Colearn</h1>
                            <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;letter-spacing:1px;text-transform:uppercase;">Learning. Together.</p>
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="padding:48px;">
                            <h2 style="margin:0 0 16px;color:#1e1b4b;font-size:24px;font-weight:600;">Welcome aboard, ${firstName}! 🎉</h2>
                            <p style="margin:0 0 24px;color:#4b5563;font-size:15px;line-height:1.7;">
                                We're so excited to have you join <strong>Colearn</strong>. Your account has been successfully created and you're all set to start your learning journey.
                            </p>

                            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ff;border-radius:8px;margin-bottom:32px;">
                                <tr>
                                    <td style="padding:20px 24px;">
                                        <p style="margin:0;color:#6d28d9;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Registered As</p>
                                        <p style="margin:4px 0 0;color:#1e1b4b;font-size:16px;font-weight:600;">${firstName} ${lastName}</p>
                                        <p style="margin:2px 0 0;color:#6b7280;font-size:14px;">${email}</p>
                                    </td>
                                </tr>
                            </table>

                            <table cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);border-radius:8px;">
                                        <a href="#" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.3px;">Get Started →</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Divider -->
                    <tr>
                        <td style="padding:0 48px;">
                            <hr style="border:none;border-top:1px solid #e5e7eb;margin:0;" />
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding:24px 48px;text-align:center;">
                            <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.6;">
                                You received this email because you signed up for Colearn.<br/>
                                If this wasn't you, please ignore this email.
                            </p>
                            <p style="margin:12px 0 0;color:#d1d5db;font-size:12px;">© ${new Date().getFullYear()} Colearn. All rights reserved.</p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>
        `;

        await sendEmail(email, "Welcome to Colearn! 🎉", "Thank you for registering with Colearn", template);
    });

    subscribeToQueue("send_otp", async (msg) => {
        const { email, otp, fullName: { firstName, lastName }, type } = msg;

        let subject, title, subtitle, bodyText;

        if (type === "registration") {
            subject = "Verify your Colearn Registration";
            title = "Verify Your Email";
            subtitle = "Complete your registration";
            bodyText = "Use the OTP below to verify your email address and complete your Colearn registration.";
        } else if (type === "forgot_password") {
            subject = "Reset your Colearn Password";
            title = "Reset Your Password";
            subtitle = "Password reset request";
            bodyText = "We received a request to reset your Colearn password. Use the OTP below to proceed.";
        }

        const template = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6fb;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6fb;padding:40px 0;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
                    
                    <!-- Header -->
                    <tr>
                        <td style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:40px 48px;text-align:center;">
                            <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:-0.5px;">Colearn</h1>
                            <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;letter-spacing:1px;text-transform:uppercase;">${subtitle}</p>
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="padding:48px;">
                            <h2 style="margin:0 0 16px;color:#1e1b4b;font-size:24px;font-weight:600;">${title}</h2>
                            <p style="margin:0 0 8px;color:#4b5563;font-size:15px;">Hi <strong>${firstName} ${lastName}</strong>,</p>
                            <p style="margin:0 0 32px;color:#4b5563;font-size:15px;line-height:1.7;">${bodyText}</p>

                            <!-- OTP Box -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                                <tr>
                                    <td align="center" style="background:linear-gradient(135deg,#f5f3ff,#ede9fe);border:2px dashed #a78bfa;border-radius:12px;padding:32px;">
                                        <p style="margin:0 0 8px;color:#7c3aed;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;">Your OTP Code</p>
                                        <p style="margin:0;color:#1e1b4b;font-size:42px;font-weight:700;letter-spacing:12px;">${otp}</p>
                                    </td>
                                </tr>
                            </table>

                            <!-- Warning -->
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="background:#fff7ed;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:16px 20px;">
                                        <p style="margin:0;color:#92400e;font-size:13px;line-height:1.6;">
                                            ⏱ This OTP expires in <strong>10 minutes</strong>.<br/>
                                            🔒 Never share this code with anyone, including Colearn support.
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Divider -->
                    <tr>
                        <td style="padding:0 48px;">
                            <hr style="border:none;border-top:1px solid #e5e7eb;margin:0;" />
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding:24px 48px;text-align:center;">
                            <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.6;">
                                If you didn't request this, you can safely ignore this email.<br/>
                                Someone else may have typed your email by mistake.
                            </p>
                            <p style="margin:12px 0 0;color:#d1d5db;font-size:12px;">© ${new Date().getFullYear()} Colearn. All rights reserved.</p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>
        `;

        await sendEmail(email, subject, `Your Colearn OTP is ${otp}`, template);
    });
}

export default startListener;