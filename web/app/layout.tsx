import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "РАНОК 2D Lab — лаборатория моделей",
  description:
    "Редактор языка РАНОК: вычисление точек, R-функции и визуализация геометрических моделей.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
