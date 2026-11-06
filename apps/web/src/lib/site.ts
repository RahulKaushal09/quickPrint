// Public addresses and contact details. They live in env files only:
// change NEXT_PUBLIC_* there (on Vercel: then redeploy), nothing in the code.

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://seedhaprint.in').replace(/\/$/, '');

export const WHATSAPP_NUMBER = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '919872556259').replace(/\D/g, '');

/** +91 98725 56259 */
export const WHATSAPP_DISPLAY = WHATSAPP_NUMBER.replace(/^(\d{2})(\d{5})(\d{5})$/, '+$1 $2 $3');

export function whatsappLink(message = 'Hi, I have a print shop and I want to know more about SeedhaPrint.') {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
