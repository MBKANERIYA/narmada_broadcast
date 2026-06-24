import { Router } from 'express';
import nodemailer from 'nodemailer';

const router = Router();

// SMTP transport configuration
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'localhost',
    port: process.env.SMTP_PORT || 1025,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
    },
});

/**
 * POST /api/v1/leads
 * Public — collects lead info and emails it to broadcast@innodify.in
 */
router.post('/', async (req, res) => {
    try {
        const { name, email, phone, business } = req.body;

        if (!name || !email) {
            return res.status(400).json({ error: 'Name and email are required' });
        }

        // Input validation (security)
        if (name.length > 100 || email.length > 254) {
            return res.status(400).json({ error: 'Input too long' });
        }
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        // Sanitize inputs to prevent injection in email body
        const sanitize = (str) => (str || '').replace(/[<>"'&]/g, '').substring(0, 200);
        const safeName = sanitize(name);
        const safeEmail = sanitize(email);
        const safePhone = sanitize(phone);
        const safeBusiness = sanitize(business);

        const mailBody = `
New signup request from WhatsApp Broadcast landing page:

Name:     ${safeName}
Email:    ${safeEmail}
Phone:    ${safePhone || 'Not provided'}
Business: ${safeBusiness || 'Not provided'}

Submitted at: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
        `.trim();

        await transporter.sendMail({
            from: `"WhatsApp Broadcast" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'noreply@localhost'}>`,
            to: process.env.SMTP_TO_EMAIL || process.env.SMTP_USER || 'admin@localhost',
            subject: `New Lead: ${safeName} — ${safeBusiness || safeEmail}`,
            text: mailBody,
            replyTo: safeEmail,
        });

        res.json({ success: true, message: 'We will contact you shortly!' });
    } catch (error) {
        console.error('[LEADS] Email send error:', error.message);
        // Still return success to the user — don't expose email errors
        res.json({ success: true, message: 'Thank you! We will get back to you soon.' });
    }
});

export default router;
