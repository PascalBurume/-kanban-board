import QRCode from "qrcode";

/**
 * A real, scannable QR rendered to SVG on the server — no client JS, no image
 * request, and it works with no network at the booth.
 *
 * SPEC §10 OPEN ITEM: the destination is still the placeholder WhatsApp number.
 * Every printed QR — flyer, poster, booth stand — must be regenerated once the
 * live WhatsApp Business number exists.
 */
export default async function QrCode({
  value,
  size = 190,
  dark = "#1A3A8F",
  light = "#FFFFFF",
}: {
  value: string;
  size?: number;
  dark?: string;
  light?: string;
}) {
  const svg = await QRCode.toString(value, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: size,
    color: { dark, light },
  });

  return (
    <div
      style={{ width: size, height: size, lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
