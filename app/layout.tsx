import "./globals.css";
import "./fonts.css";
import "./models.css";
import type { ReactNode } from "react";

export const metadata = { title: "CortiFree Auto Publisher", description: "Content operations for CortiFree" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="fr"><body>{children}</body></html>;
}
