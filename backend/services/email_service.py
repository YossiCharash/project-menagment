import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
from backend.core.config import settings
import html


def get_frontend_url() -> str:
    """Get frontend URL from settings"""
    return settings.FRONTEND_URL


class EmailService:
    def __init__(self):
        self.smtp_server = settings.SMTP_SERVER or "smtp.gmail.com"
        self.smtp_port = settings.SMTP_PORT or 587
        self.smtp_username = settings.SMTP_USERNAME or ""
        self.smtp_password = settings.SMTP_PASSWORD or ""
        # If FROM_EMAIL is not set, use SMTP_USERNAME as default
        self.from_email = settings.FROM_EMAIL or self.smtp_username or "noreply@example.com"

    async def send_verification_email(self, email: str, verification_code: str, full_name: str, verification_type: str, verification_link: str = None) -> bool:
        """Send email verification code and/or link"""
        try:
            link_text = f"\n\nאו לחצו על הקישור הבא:\n{verification_link}\n" if verification_link else ""

            if verification_type == 'admin_register':
                subject = "אימות כתובת אימייל - רישום מנהל מערכת"
                body = f"""שלום {full_name},

קיבלתם הודעה זו כי נרשמתם כמנהל מערכת במערכת ניהול פרויקטי החזקת מבנים.

קוד האימות שלכם הוא: {verification_code}
{link_text}

קוד זה תקף למשך 15 דקות.

אם לא נרשמתם למערכת, אנא התעלמו מהודעה זו.

בברכה,
צוות המערכת"""
            elif verification_type == 'member_register':
                subject = "אימות כתובת אימייל - רישום משתמש"
                body = f"""שלום {full_name},

קיבלתם הודעה זו כי נרשמתם כמשתמש במערכת ניהול פרויקטי החזקת מבנים.

קוד האימות שלכם הוא: {verification_code}
{link_text}

קוד זה תקף למשך 15 דקות.

אם לא נרשמתם למערכת, אנא התעלמו מהודעה זו.

בברכה,
צוות המערכת"""
            else:
                subject = "אימות כתובת אימייל"
                body = f"""שלום,

קוד האימות שלכם הוא: {verification_code}
{link_text}

קוד זה תקף למשך 15 דקות.

בברכה,
צוות המערכת"""

            return await self._send_email(email, subject, body)
        except Exception:
            return False

    async def send_admin_invite_email(self, email: str, full_name: str, invite_code: str) -> bool:
        """Send admin invite email"""
        try:
            subject = "הזמנה להצטרפות כמנהל מערכת"
            body = f"""
            שלום {full_name},

            הוזמנתם להצטרף כמנהל מערכת במערכת ניהול פרויקטי החזקת מבנים.

            קוד ההזמנה שלכם הוא: {invite_code}

            כדי להשלים את ההרשמה, גשו לקישור הבא:
            http://localhost:3000/admin-invite

            קוד זה תקף למשך 7 ימים.

            בברכה,
            צוות המערכת
            """

            return await self._send_email(email, subject, body)
        except Exception:
            return False

    async def send_member_invite_email(self, email: str, full_name: str, registration_link: str, expires_days: int) -> bool:
        """Send member/employee invite email with registration link"""
        try:
            subject = "הזמנה להצטרפות למערכת ניהול פרויקטים"
            body = f"""
            שלום {full_name},

            הוזמנתם להצטרף למערכת ניהול פרויקטי החזקת מבנים.

            כדי להשלים את ההרשמה, לחצו על הקישור הבא:
            {registration_link}

            הקישור תקף למשך {expires_days} ימים.

            אם לא יצרתם את הקישור הזה, אנא התעלמו מהודעה זו.

            בברכה,
            צוות המערכת
            """

            return await self._send_email(email, subject, body)
        except Exception:
            return False

    async def send_user_credentials_email(self, email: str, full_name: str, password: str, role: str, reset_token: str = None) -> bool:
        """Send user credentials email when admin creates a new user"""
        try:
            role_hebrew = "מנהל מערכת" if role == "Admin" else "משתמש"
            subject = "פרטי התחברות למערכת ניהול פרויקטים"
            
            # Create reset link if token provided
            reset_link = f"{get_frontend_url()}/reset-password?token={reset_token}" if reset_token else None
            
            # Plain text version
            if reset_link:
                body = f"""שלום {full_name},

נוצר עבורך חשבון במערכת ניהול פרויקטי החזקת מבנים.

כדי להגדיר סיסמה ולהתחיל להשתמש במערכת, אנא לחצו על הקישור הבא:
{reset_link}

אימייל להתחברות: {email}
תפקיד: {role_hebrew}

אם לא ציפיתם לקבל הודעה זו, אנא התעלמו ממנה.

בברכה,
צוות המערכת"""
            else:
                body = f"""שלום {full_name},

נוצר עבורך חשבון במערכת ניהול פרויקטי החזקת מבנים.

פרטי ההתחברות שלך:
אימייל: {email}
סיסמה: {password}
תפקיד: {role_hebrew}

אנא התחברו למערכת באמצעות הפרטים שלעיל.
מומלץ לשנות את הסיסמה לאחר ההתחברות הראשונה.

קישור להתחברות: {get_frontend_url()}/login

אם לא ציפיתם לקבל הודעה זו, אנא התעלמו ממנה.

בברכה,
צוות המערכת"""

            return await self._send_email(email, subject, body)
        except Exception:
            return False

    def _create_html_email(self, body: str) -> str:
        """Create HTML email with RTL support"""
        # Escape HTML special characters
        body_html = html.escape(body)
        
        # Convert URLs to clickable links
        import re
        url_pattern = r'(https?://[^\s]+)'
        body_html = re.sub(url_pattern, r'<a href="\1" style="color: #4a90e2; text-decoration: none;">\1</a>', body_html)
        
        # Replace newlines with <br> tags
        body_html = body_html.replace('\n', '<br>')
        
        # Make verification codes and passwords stand out
        body_html = re.sub(r'קוד האימות שלכם הוא: (\d+)', r'קוד האימות שלכם הוא: <strong style="font-size: 18px; color: #4a90e2;">\1</strong>', body_html)
        body_html = re.sub(r'סיסמה: ([^\n<]+)', r'סיסמה: <strong style="font-size: 16px; color: #e74c3c; font-family: monospace;">\1</strong>', body_html)
        
        html_content = f"""
        <!DOCTYPE html>
        <html dir="rtl" lang="he">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {{
                    font-family: Arial, Helvetica, sans-serif;
                    direction: rtl;
                    text-align: right;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }}
                .container {{
                    background-color: #f9f9f9;
                    border-radius: 8px;
                    padding: 20px;
                    margin: 20px 0;
                }}
                .header {{
                    background-color: #4a90e2;
                    color: white;
                    padding: 15px;
                    border-radius: 8px 8px 0 0;
                    text-align: center;
                    font-size: 18px;
                    font-weight: bold;
                }}
                .content {{
                    background-color: white;
                    padding: 20px;
                    border-radius: 0 0 8px 8px;
                }}
                .footer {{
                    text-align: center;
                    color: #666;
                    font-size: 12px;
                    margin-top: 20px;
                }}
                a {{
                    color: #4a90e2;
                    text-decoration: none;
                }}
                a:hover {{
                    text-decoration: underline;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    מערכת ניהול פרויקטים
                </div>
                <div class="content">
                    {body_html}
                </div>
            </div>
            <div class="footer">
                <p>הודעה זו נשלחה אוטומטית מהמערכת</p>
            </div>
        </body>
        </html>
        """
        return html_content

    async def _send_email(self, to_email: str, subject: str, body: str, html_body: str = None) -> bool:
        """Send email using SMTP"""
        try:
            print(f"📧 Attempting to send email to {to_email}")
            print(f"   SMTP Server: {self.smtp_server}:{self.smtp_port}")
            print(f"   SMTP Username: {self.smtp_username[:3] + '***' if self.smtp_username else 'NOT SET'}")
            
            # Validate email parameters
            if not to_email or not isinstance(to_email, str):
                raise ValueError("Invalid email address")
            if not subject or not isinstance(subject, str):
                raise ValueError("Invalid subject")
            if not body or not isinstance(body, str):
                raise ValueError("Invalid email body")
            
            # If no SMTP credentials, log warning and return False
            smtp_username = (self.smtp_username or "").strip()
            smtp_password = (self.smtp_password or "").strip()
            
            print(f"   Username after strip: {'SET' if smtp_username else 'NOT SET'}")
            print(f"   Password after strip: {'SET' if smtp_password else 'NOT SET'}")
            
            if not smtp_username or not smtp_password:
                import logging
                logging.warning(f"SMTP credentials not configured. Email to {to_email} was not sent.")
                print(f"⚠️  SMTP credentials not configured. Email to {to_email} was not sent.")
                print(f"   SMTP_USERNAME: {'SET' if smtp_username else 'NOT SET'}")
                print(f"   SMTP_PASSWORD: {'SET' if smtp_password else 'NOT SET'}")
                print(f"   Please configure SMTP_USERNAME and SMTP_PASSWORD in your .env file")
                return False

            # Ensure from_email is set
            from_email = (self.from_email or self.smtp_username or "noreply@example.com").strip()
            if not from_email:
                from_email = self.smtp_username or "noreply@example.com"
            
            print(f"   From Email: {from_email}")

            # Create message
            message = MIMEMultipart()
            message["From"] = from_email
            message["To"] = to_email
            message["Subject"] = subject

            # Create HTML version if not provided
            if html_body is None:
                html_body = self._create_html_email(body)

            # Send only HTML version to avoid duplicate content
            # HTML version with RTL support
            message.attach(MIMEText(html_body, "html", "utf-8"))

            # Create SMTP session
            print(f"   Connecting to SMTP server...")
            context = ssl.create_default_context()
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                print(f"   Starting TLS...")
                server.starttls(context=context)
                print(f"   Logging in...")
                server.login(smtp_username, smtp_password)
                print(f"   Sending email...")
                server.sendmail(from_email, to_email, message.as_string())

            print(f"✅ Email sent successfully to {to_email}")
            return True
        except Exception as e:
            import logging
            import traceback
            error_msg = str(e)
            logging.error(f"Failed to send email to {to_email}: {error_msg}")
            logging.error(traceback.format_exc())
            print(f"❌ Failed to send email to {to_email}: {error_msg}")
            print(f"   Error details: {traceback.format_exc()}")
            return False
