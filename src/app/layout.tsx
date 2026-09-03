import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "RentFlow", template: "%s · RentFlow" },
  description:
    "Launch a storefront for your rental business with orders, payments, inventory, AI reminders and an AI support bot.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
