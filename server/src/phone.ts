/** Malaysian numbering only. No identity lookup or OTP delivery uses display formatting. */
export function malaysianPhone(value: unknown): string {
  const invalid = () => Object.assign(new Error("Enter a valid Malaysian phone number (+60)"), { statusCode: 400 });
  if (typeof value !== "string" || value.length > 40) throw invalid();
  const text = value.trim();
  if (!/^\+?[\d\s()-]+$/.test(text)) throw invalid();
  let digits = text.replace(/[\s()-]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (digits.startsWith("+")) {
    if (!digits.startsWith("+60")) throw invalid();
    digits = digits.slice(1);
  } else if (digits.startsWith("0")) digits = `60${digits.slice(1)}`;
  if (!/^60[1-9]\d{7,9}$/.test(digits)) throw invalid();
  return `+${digits}`;
}
