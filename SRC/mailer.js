import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

// Create reusable transporter object using the default SMTP transport
const createTransporter = () => {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

export const sendFineIssuedEmail = async ({ to, name, baseAmount, surcharge, reason, paymentDeadline }) => {
  try {
    const transporter = createTransporter();
    
    // Fallback if env vars not set, so it doesn't crash the server
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn("EMAIL_USER or EMAIL_PASS not set in .env. Skipping email send.");
      return false;
    }

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
        <h2 style="color: #f97316; text-align: center;">Official Fine Notification</h2>
        <p>Dear <strong>${name}</strong>,</p>
        <p>This is an official notification from the Sergeant-at-Arms (SAA) of the Rotaract Club of TCET.</p>
        <p>A fine has been issued to you for the following reason:</p>
        <blockquote style="border-left: 4px solid #f97316; padding-left: 10px; color: #555; font-style: italic;">
          "${reason}"
        </blockquote>
        
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Base Fine Amount:</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">₹${baseAmount}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Payment Deadline:</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right; color: #dc2626;">${paymentDeadline}</td>
          </tr>
          <tr>
            <td style="padding: 10px; font-weight: bold;">Weekly Surcharge:</td>
            <td style="padding: 10px; text-align: right; color: #dc2626;">+₹${surcharge} / week late</td>
          </tr>
        </table>
        
        <p style="margin-top: 20px; font-size: 14px; color: #666;">
          Please ensure this fine is cleared before the deadline to avoid additional weekly surcharges.
          Contact the SAA if you have any questions or to arrange payment.
        </p>
        
        <p style="margin-top: 30px; font-size: 12px; text-align: center; color: #999;">
          This is an automated message from the RC TCET Admin Portal.
        </p>
      </div>
    `;

    const info = await transporter.sendMail({
      from: `"RC TCET SAA" <${process.env.EMAIL_USER}>`,
      to,
      subject: "Action Required: Fine Notification - RC TCET",
      html: htmlContent,
    });
    
    console.log("Fine notification email sent: %s", info.messageId);
    return true;
  } catch (error) {
    console.error("Error sending fine notification email:", error);
    return false;
  }
};

export const sendFineReceiptEmail = async ({ to, name, totalPaid, reason }) => {
  try {
    const transporter = createTransporter();
    
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn("EMAIL_USER or EMAIL_PASS not set in .env. Skipping email send.");
      return false;
    }

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
        <h2 style="color: #10b981; text-align: center;">Payment Receipt</h2>
        <p>Dear <strong>${name}</strong>,</p>
        <p>Thank you! Your fine payment has been received and successfully logged by the Sergeant-at-Arms (SAA).</p>
        
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Reason for Fine:</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${reason}</td>
          </tr>
          <tr>
            <td style="padding: 10px; font-weight: bold;">Total Amount Paid:</td>
            <td style="padding: 10px; text-align: right; color: #10b981; font-weight: bold;">₹${totalPaid}</td>
          </tr>
        </table>
        
        <p style="margin-top: 20px; font-size: 14px; color: #666;">
          Your dues are cleared. We appreciate your cooperation!
        </p>
        
        <p style="margin-top: 30px; font-size: 12px; text-align: center; color: #999;">
          This is an automated receipt from the RC TCET Admin Portal.
        </p>
      </div>
    `;

    const info = await transporter.sendMail({
      from: `"RC TCET SAA" <${process.env.EMAIL_USER}>`,
      to,
      subject: "Payment Receipt: Fine Cleared - RC TCET",
      html: htmlContent,
    });
    
    console.log("Fine receipt email sent: %s", info.messageId);
    return true;
  } catch (error) {
    console.error("Error sending fine receipt email:", error);
    return false;
  }
};
