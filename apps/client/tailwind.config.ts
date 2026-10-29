import typography from "@tailwindcss/typography";

const isSelfHostBuild = Boolean(process.env.NEXT_PUBLIC_SELF_HOST_MODE?.trim());

const config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./content/**/*.{js,ts,jsx,tsx,mdx}",
    // Cloud-only UI is a real workspace dependency of this app. Tailwind must
    // scan it as source; otherwise class merging can remove a Core fallback in
    // favour of a Managed class that never reaches the generated stylesheet.
    // Keep the source out of self-host compilation so the public candidate
    // remains independent from Managed code.
    ...(!isSelfHostBuild
      ? ["../../packages/managed-client/src/**/*.{js,ts,jsx,tsx,mdx}"]
      : []),
  ],
  safelist: [
    // Grid columns
    "grid-cols-1",
    "grid-cols-2",
    "grid-cols-3",
    "grid-cols-4",
    "grid-cols-5",
    "grid-cols-6",
    "grid-cols-7",
    "grid-cols-8",
    "grid-cols-9",
    "grid-cols-10",
    "grid-cols-11",
    "grid-cols-12",
    // Responsive grid columns
    "md:grid-cols-1",
    "md:grid-cols-2",
    "md:grid-cols-3",
    "md:grid-cols-4",
    "md:grid-cols-5",
    "md:grid-cols-6",
    "md:grid-cols-7",
    "md:grid-cols-8",
    "md:grid-cols-9",
    "md:grid-cols-10",
    "md:grid-cols-11",
    "md:grid-cols-12",
    "lg:grid-cols-1",
    "lg:grid-cols-2",
    "lg:grid-cols-3",
    "lg:grid-cols-4",
    "lg:grid-cols-5",
    "lg:grid-cols-6",
    "lg:grid-cols-7",
    "lg:grid-cols-8",
    "lg:grid-cols-9",
    "lg:grid-cols-10",
    "lg:grid-cols-11",
    "lg:grid-cols-12",
    "xl:grid-cols-1",
    "xl:grid-cols-2",
    "xl:grid-cols-3",
    "xl:grid-cols-4",
    "xl:grid-cols-5",
    "xl:grid-cols-6",
    "xl:grid-cols-7",
    "xl:grid-cols-8",
    "xl:grid-cols-9",
    "xl:grid-cols-10",
    "xl:grid-cols-11",
    "xl:grid-cols-12",
    "2xl:grid-cols-1",
    "2xl:grid-cols-2",
    "2xl:grid-cols-3",
    "2xl:grid-cols-4",
    "2xl:grid-cols-5",
    "2xl:grid-cols-6",
    "2xl:grid-cols-7",
    "2xl:grid-cols-8",
    "2xl:grid-cols-9",
    "2xl:grid-cols-10",
    "2xl:grid-cols-11",
    "2xl:grid-cols-12",
    // Grid rows
    "grid-rows-1",
    "grid-rows-2",
    "grid-rows-3",
    "grid-rows-4",
    "grid-rows-5",
    "grid-rows-6",
    // Responsive grid rows
    "md:grid-rows-1",
    "md:grid-rows-2",
    "md:grid-rows-3",
    "md:grid-rows-4",
    "md:grid-rows-5",
    "md:grid-rows-6",
    "lg:grid-rows-1",
    "lg:grid-rows-2",
    "lg:grid-rows-3",
    "lg:grid-rows-4",
    "lg:grid-rows-5",
    "lg:grid-rows-6",
    // Display utilities
    "hidden",
    "block",
    "flex",
    "md:hidden",
    "md:block",
    "md:flex",
    "lg:hidden",
    "lg:block",
    "lg:flex",
    "xl:hidden",
    "xl:block",
    "xl:flex",
    "2xl:hidden",
    "2xl:block",
    "2xl:flex",
    // Border utilities
    "border-neutral-50",
    "border-neutral-100",
    "border-neutral-200",
    "border-neutral-300",
    "border-neutral-400",
    "border-neutral-500",
    "border-neutral-600",
    "border-neutral-700",
    "border-neutral-750",
    "border-neutral-800",
    "border-neutral-900",
    "border-neutral-1000",
    // Calendar activity and TSS badges
    "bg-run",
    "bg-cycling",
    "bg-swim",
    "bg-unknown",
    // TSS purple scale
    "bg-tss-100",
    "bg-tss-100/50",
    "border-tss-100",
    "bg-tss-500",
    "border-tss-500",
    "bg-tss-900",
    "border-tss-900",
  ],
  theme: {
    colors: {
      // 完全覆盖 neutral 颜色，确保包含所有自定义级别
      neutral: {
        50: "hsl(var(--neutral-50))",
        100: "hsl(var(--neutral-100))",
        200: "hsl(var(--neutral-200))",
        300: "hsl(var(--neutral-300))",
        400: "hsl(var(--neutral-400))",
        500: "hsl(var(--neutral-500))",
        600: "hsl(var(--neutral-600))",
        700: "hsl(var(--neutral-700))",
        750: "hsl(var(--neutral-750))",
        800: "hsl(var(--neutral-800))",
        900: "hsl(var(--neutral-900))",
        1000: "hsl(var(--neutral-1000))",
      },
      blue: {
        50: "hsl(var(--blue-50))",
        100: "hsl(var(--blue-100))",
        200: "hsl(var(--blue-200))",
        300: "hsl(var(--blue-300))",
        400: "hsl(var(--blue-400))",
        500: "hsl(var(--blue-500))",
        600: "hsl(var(--blue-600))",
        700: "hsl(var(--blue-700))",
        800: "hsl(var(--blue-800))",
        900: "hsl(var(--blue-900))",
        950: "hsl(var(--blue-950))",
      },
      rose: {
        50: "hsl(var(--rose-50))",
        100: "hsl(var(--rose-100))",
        200: "hsl(var(--rose-200))",
        300: "hsl(var(--rose-300))",
        400: "hsl(var(--rose-400))",
        500: "hsl(var(--rose-500))",
        600: "hsl(var(--rose-600))",
        700: "hsl(var(--rose-700))",
        800: "hsl(var(--rose-800))",
        900: "hsl(var(--rose-900))",
        950: "hsl(var(--rose-950))",
      },
    },
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      screens: {
        // Product shell contract: phone < 768, tablet 768–1023, PC >= 1024.
        tablet: "768px",
        pc: "1024px",
      },
      colors: {
        // Purple scale for TSS badge
        tss: {
          100: "hsl(var(--indigo-100))",
          500: "hsl(var(--indigo-200))",
          900: "hsl(var(--indigo-300))",
        },
        // 自定义运动类型浅色，用于日历条目背景
        run: {
          DEFAULT: "#FED7AA", // 浅橙色（近似 orange-200）
        },
        cycling: {
          DEFAULT: "#a7f3d0", // emerald-200，与营销绿同一色系
        },
        swim: {
          DEFAULT: "#BAE6FD", // 浅蓝色（近似 sky-200）
        },
        unknown: {
          DEFAULT: "#E5E7EB", // 浅灰色（近似 gray-200）
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
          50: "hsl(var(--accent-50))",
          100: "hsl(var(--accent-100))",
          200: "hsl(var(--accent-200))",
          300: "hsl(var(--accent-300))",
          400: "hsl(var(--accent-400))",
          500: "hsl(var(--accent-500))",
          600: "hsl(var(--accent-600))",
          700: "hsl(var(--accent-700))",
          800: "hsl(var(--accent-800))",
          900: "hsl(var(--accent-900))",
          950: "hsl(var(--accent-950))",
        },
        dataviz: {
          DEFAULT: "hsl(var(--dataviz))",
          "2": "hsl(var(--dataviz-2))",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [typography],
};

export default config;
