import type { Metadata } from "next";
import {
  Inter,
  Prompt,
  Roboto_Flex,
  Source_Code_Pro,
} from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const prompt = Prompt({
  variable: "--font-prompt",
  subsets: ["latin", "thai"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const robotoFlex = Roboto_Flex({
  variable: "--font-roboto-flex",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const sourceCode = Source_Code_Pro({
  variable: "--font-source-code",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Text Match CUT",
  description:
    "Generate animated match cuts from Wikipedia articles with customizable export and animation settings.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${prompt.variable} ${robotoFlex.variable} ${sourceCode.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
