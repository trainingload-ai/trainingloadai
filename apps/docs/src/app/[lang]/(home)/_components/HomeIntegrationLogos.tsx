import Image from "next/image";
import { cn } from "@/lib/utils";

export type IntegrationPlatform = {
  id: string;
  name: string;
  src: string;
  srcLight?: string;
  srcDark?: string;
  width: number;
  height: number;
  inverted?: boolean;
  status: "live" | "launching" | "planned";
};

type LogoTone = "auto" | "light" | "dark";

export const integrationPlatforms: IntegrationPlatform[] = [
  {
    id: "strava",
    name: "Strava",
    src: "/logo/strava.svg",
    width: 96,
    height: 20,
    inverted: true,
    status: "live",
  },
  {
    id: "polar",
    name: "Polar",
    src: "/logo/polar-logo.svg",
    width: 122,
    height: 20,
    status: "live",
  },
  {
    id: "intervals",
    name: "Intervals.icu",
    src: "/logo/intervals-logo-round.svg",
    width: 163,
    height: 163,
    status: "live",
  },
  {
    id: "garmin",
    name: "Garmin",
    src: "/logo/garmin_white.png",
    width: 120,
    height: 28,
    inverted: true,
    status: "live",
  },
  {
    id: "coros",
    name: "COROS",
    src: "/logo/coros_white.png",
    srcLight: "/logo/coros_black.png",
    srcDark: "/logo/coros_white.png",
    width: 988,
    height: 252,
    status: "launching",
  },
  {
    id: "wahoo",
    name: "Wahoo",
    src: "/logo/wahoo.svg",
    width: 273,
    height: 67,
    status: "live",
  },
  {
    id: "suunto",
    name: "SUUNTO",
    src: "/logo/suunto.svg",
    width: 150,
    height: 49,
    status: "live",
  },
  {
    id: "whoop",
    name: "WHOOP",
    src: "/logo/whoop.svg",
    width: 205,
    height: 35,
    status: "planned",
  },
];

const livePlatforms = integrationPlatforms.filter(
  (platform) => platform.status === "live",
);
const launchingPlatforms = integrationPlatforms.filter(
  (platform) => platform.status === "launching",
);

const showcaseLogoClassName: Record<IntegrationPlatform["id"], string> = {
  strava: "h-[18px] w-auto md:h-[22px]",
  intervals: "h-[22px] text-[18px] md:h-[26px] md:text-[20px]",
  garmin: "h-[19px] w-auto md:h-[23px]",
  polar: "h-[15px] w-auto md:h-[19px]",
  coros: "h-[24px] w-auto max-w-[100px] md:h-[28px] md:max-w-[120px]",
  wahoo: "h-[18px] w-auto md:h-[22px]",
  suunto: "h-[17px] w-auto md:h-[21px]",
  whoop: "h-[16px] w-auto md:h-[20px]",
};

function logoToneClassName(tone: LogoTone) {
  if (tone === "light") {
    return "text-foreground";
  }
  if (tone === "dark") {
    return "text-white";
  }
  return "text-foreground";
}

function PolarLogo({
  className,
  tone = "auto",
}: {
  className?: string;
  tone?: LogoTone;
}) {
  return (
    <svg
      viewBox="0 0 122 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("inline-block shrink-0", logoToneClassName(tone), className)}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6.09857 8.62026H16.8344C17.5764 8.62026 18.22 8.02049 18.2889 7.28487C18.3607 6.51658 17.7787 5.89942 17.0037 5.89942H4.15251C4.69646 4.32386 5.24041 2.74944 5.78437 1.17483C5.9241 0.771288 6.31623 0.483154 6.74828 0.483154H18.063C21.9138 0.483154 24.8073 3.63715 24.4511 7.45435C24.1094 11.1103 20.9081 14.0149 17.2214 14.0161C14.8659 14.018 12.5102 14.018 10.1538 14.0191C9.49586 14.0191 8.93042 14.4297 8.73022 15.0112C8.30201 16.2506 7.87418 17.4909 7.4452 18.7292C7.30566 19.1329 6.91661 19.4209 6.48455 19.4209H1.2746C0.351954 19.4209 -0.217717 18.5485 0.0790189 17.6902C0.806655 15.5832 1.53544 13.4767 2.26212 11.3698C2.81931 9.75636 4.37017 8.62026 6.09857 8.62026Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M105.741 19.4209C105.34 17.9271 104.938 16.4324 104.536 14.9376C104.384 14.3703 103.905 14.0168 103.322 14.0168C102.765 14.018 102.208 14.018 101.652 14.018C100.995 14.0189 100.429 14.4288 100.228 15.011C99.8004 16.2505 99.3722 17.4899 98.9432 18.7283C98.8047 19.1327 98.4146 19.4209 97.9826 19.4209H92.7728C91.8502 19.4209 91.2803 18.5483 91.577 17.689C92.3047 15.5832 93.0335 13.4765 93.7601 11.3696C94.3185 9.75636 95.8684 8.62007 97.5966 8.62007H108.333C109.075 8.62007 109.719 8.01934 109.787 7.28468C109.859 6.51639 109.277 5.89923 108.503 5.89923H95.6507C96.1947 4.32271 96.7388 2.74829 97.2837 1.17483C97.4221 0.771288 97.8143 0.483154 98.2475 0.483154H109.56C113.412 0.483154 116.305 3.63715 115.948 7.45435C115.708 10.0311 114.045 12.2361 111.792 13.312C112.343 15.34 112.89 17.3682 113.439 19.4209H105.741Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M58.476 5.89828C58.9603 4.49448 59.4459 3.09164 59.9313 1.68766C60.1376 1.09095 59.7344 0.483154 59.0927 0.483154H53.379C52.9469 0.483154 52.5548 0.770142 52.4152 1.17368C51.8713 2.74829 51.3273 4.32271 50.7822 5.89828H58.476Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M63.2275 19.4165H47.9059C46.9842 19.4165 46.4146 18.5439 46.7123 17.6847C47.7562 14.6623 48.8009 11.639 49.8447 8.61572H57.5374C57.1802 9.65075 56.822 10.6879 56.4639 11.7229C56.1683 12.5812 56.7502 13.4536 57.6708 13.4536H64.1986C65.1212 13.4536 65.7095 14.3241 65.4128 15.1815C65.0053 16.3627 64.5968 17.5437 64.1893 18.7239C64.0487 19.1284 63.6596 19.4165 63.2275 19.4165Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M80.9213 0.845806C79.5099 2.53066 78.0998 4.21437 76.6875 5.89828H88.0905C87.9489 4.35749 87.8061 2.81669 87.6646 1.27495C87.6203 0.810075 87.2375 0.483154 86.7696 0.483154H81.7003C81.3975 0.483154 81.1132 0.615948 80.9213 0.845806Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M82.4603 19.4165H88.2244C88.8042 19.4165 89.2896 18.8913 89.2365 18.312C88.9367 15.0802 88.638 11.8475 88.3403 8.61572H74.4074C72.0057 11.4837 69.603 14.3518 67.1992 17.2198C66.4684 18.0924 66.9807 19.4165 68.1515 19.4165H72.7304C73.0321 19.4165 73.3195 19.2685 73.5103 19.0384C74.7717 17.5335 76.0321 16.0285 77.2935 14.5244C77.5705 14.1944 77.9822 14.0125 78.4143 14.0125H79.9611C80.6333 14.0125 81.1845 14.4755 81.2471 15.1467C81.3538 16.3002 81.4605 17.4539 81.5663 18.6062C81.6093 19.0732 81.9931 19.4165 82.4603 19.4165Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M46.2037 8.61572C46.6717 14.5653 41.7636 19.8109 35.818 19.9947C29.5343 20.1879 24.9865 14.7307 26.2286 8.61572H46.2037Z"
        fill="#E51D34"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M45.5819 5.89684C44.1151 2.14499 40.4798 -0.100663 36.4964 0.00347032C32.5634 0.104738 28.9753 2.44229 27.1914 5.89684H45.5819Z"
        fill="#E51D34"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M118.267 17.2062V16.2911H119.009C119.325 16.2911 119.656 16.3544 119.656 16.7493C119.656 17.1446 119.325 17.2062 119.009 17.2062H118.267ZM120.002 16.7119C119.976 16.166 119.534 16.0686 119.083 16.0686H117.951V18.645H118.269V17.4577H118.851C119.099 17.8538 119.345 18.2497 119.591 18.645H119.971C119.71 18.248 119.449 17.8509 119.188 17.4537C119.681 17.4332 120.027 17.2611 120.002 16.7119Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M118.807 19.3565C117.7 19.3565 116.86 18.4283 116.86 17.3533C116.86 16.2764 117.7 15.3471 118.807 15.3471C119.911 15.3471 120.752 16.2764 120.752 17.3533C120.752 18.4283 119.911 19.3565 118.807 19.3565ZM118.809 15.04C117.527 15.04 116.488 16.073 116.488 17.3499C116.488 18.6243 117.527 19.6578 118.809 19.6578C120.09 19.6578 121.128 18.6243 121.128 17.3499C121.128 16.073 120.09 15.04 118.809 15.04Z"
        fill="currentColor"
      />
    </svg>
  );
}

function WahooLogo({
  className,
  tone = "auto",
}: {
  className?: string;
  tone?: LogoTone;
}) {
  return (
    <svg
      viewBox="0 0 273 67"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("inline-block shrink-0", logoToneClassName(tone), className)}
      aria-hidden="true"
    >
      <path
        d="M26.3106 46.6057L36.5976 24.8261H45.2064L55.4935 46.6057L65.7805 24.8261H81.804L60.4393 65.0099H51.0317L40.9061 43.0032L30.7804 65.0099H21.3728L0 24.8261H16.1042L26.3106 46.6057ZM124.364 65.0099H109.849V60.5459H109.688C107.138 64.54 102.112 66.3412 97.3274 66.3412C85.2088 66.3412 76.6726 56.3951 76.6726 44.8827C76.6726 33.3703 85.0475 23.5025 97.166 23.5025C101.87 23.5025 106.816 25.2255 109.841 28.7497V24.8339H124.356V65.0177L124.364 65.0099ZM91.6715 44.961C91.6715 50.0516 95.1005 53.9674 100.998 53.9674C106.896 53.9674 110.325 50.0516 110.325 44.961C110.325 39.8705 106.904 35.8686 100.998 35.8686C95.0924 35.8686 91.6715 40.0272 91.6715 44.961ZM141.203 0V29.9244H141.364C144.712 25.5388 148.779 23.5025 154.443 23.5025C164.81 23.5025 169.829 30.2377 169.829 40.4266V65.0177H155.322V44.4207C155.322 39.7217 154.604 34.8662 148.787 34.8662C142.969 34.8662 141.211 39.7217 141.211 44.4207V65.0177H126.696V0H141.211H141.203ZM220.868 44.961C220.868 58.588 209.379 66.3412 196.228 66.3412C183.077 66.3412 171.588 58.6663 171.588 44.961C171.588 31.2558 183.069 23.5025 196.228 23.5025C209.387 23.5025 220.868 31.2558 220.868 44.961ZM186.901 44.961C186.901 50.0516 190.33 53.9674 196.236 53.9674C202.142 53.9674 205.563 50.0516 205.563 44.961C205.563 39.8705 202.134 35.8686 196.236 35.8686C190.338 35.8686 186.901 40.0272 186.901 44.961ZM272.07 44.961C272.07 58.588 260.589 66.3412 247.429 66.3412C234.27 66.3412 222.789 58.6663 222.789 44.961C222.789 31.2558 234.27 23.5025 247.429 23.5025C260.589 23.5025 272.07 31.2558 272.07 44.961ZM238.102 44.961C238.102 50.0516 241.531 53.9674 247.429 53.9674C253.327 53.9674 256.764 50.0516 256.764 44.961C256.764 39.8705 253.335 35.8686 247.429 35.8686C241.523 35.8686 238.102 40.0272 238.102 44.961Z"
        fill="currentColor"
      />
    </svg>
  );
}

function WhoopLogo({
  className,
  tone = "auto",
}: {
  className?: string;
  tone?: LogoTone;
}) {
  return (
    <svg
      viewBox="0 0 205 35"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("inline-block shrink-0", logoToneClassName(tone), className)}
      aria-hidden="true"
    >
      <path
        d="M56.3721 0.855469H52.293V34.1962H56.3721V0.855469Z"
        fill="currentColor"
      />
      <path
        d="M72.1082 15.4844H60.4258V19.5652H72.1082V15.4844Z"
        fill="currentColor"
      />
      <path
        d="M80.2627 0.855469H76.1836V34.1962H80.2627V0.855469Z"
        fill="currentColor"
      />
      <path
        d="M170.727 34.1962H174.806V0.855469H170.727V34.1962Z"
        fill="currentColor"
      />
      <path
        d="M184.326 0.855469H178.859V4.82526H184.326C188.433 4.93631 191.652 8.35088 191.541 12.4317C191.43 16.3738 188.266 19.5385 184.326 19.6495H178.859V23.6193H184.326C190.597 23.6193 195.703 18.5113 195.703 12.2374C195.703 5.96345 190.625 0.855469 184.326 0.855469Z"
        fill="currentColor"
      />
      <path
        d="M104.993 0.855469C95.7806 0.855469 88.3161 8.32312 88.3438 17.5397C88.3716 26.7563 95.8083 34.2239 105.021 34.1962C114.234 34.1962 121.671 26.7285 121.671 17.5119C121.643 8.32312 114.206 0.855469 104.993 0.855469ZM104.993 30.2819C97.9728 30.2819 92.2565 24.5632 92.2565 17.5397C92.2565 10.5162 97.9728 4.7975 104.993 4.7975C112.014 4.7975 117.73 10.4885 117.73 17.5397C117.73 24.5632 112.042 30.2819 104.993 30.2819Z"
        fill="currentColor"
      />
      <path
        d="M145.474 0.855469C136.261 0.855469 128.797 8.32312 128.824 17.5397C128.852 26.7563 136.289 34.2239 145.502 34.1962C154.714 34.1962 162.151 26.7285 162.151 17.5119C162.123 8.32312 154.686 0.855469 145.474 0.855469ZM145.474 30.2819C138.453 30.2819 132.737 24.5909 132.737 17.5397C132.737 10.4885 138.425 4.7975 145.474 4.7975C152.494 4.7975 158.211 10.4885 158.211 17.5397C158.211 24.5632 152.494 30.2819 145.474 30.2819Z"
        fill="currentColor"
      />
      <path
        d="M32.4845 27.7001L28.1556 13.4589H24.1875L30.5143 34.1962H34.4547L44.6108 0.855469H40.6427L32.4845 27.7001Z"
        fill="currentColor"
      />
      <path
        d="M4.01069 0.855469H0.0703125L6.36936 21.5928H10.3375L4.01069 0.855469Z"
        fill="currentColor"
      />
      <path
        d="M20.3511 0.855469L10.2227 34.1962H14.163L24.3192 0.855469H20.3511Z"
        fill="currentColor"
      />
      <path
        d="M202.392 5.7422C201.032 5.7422 199.922 4.63177 199.922 3.27149C199.922 1.91122 201.032 0.800781 202.392 0.800781C203.751 0.800781 204.861 1.91122 204.861 3.27149C204.861 4.63177 203.751 5.7422 202.392 5.7422ZM202.392 1.27271C201.309 1.27271 200.421 2.16106 200.421 3.24373V3.27149C200.366 4.35416 201.198 5.27027 202.281 5.32579C203.363 5.38131 204.278 4.54849 204.334 3.46582C204.334 3.4103 204.334 3.32701 204.334 3.27149C204.362 2.18882 203.502 1.30047 202.419 1.27271H202.392ZM202.919 4.60401L202.364 3.5491H202.031V4.60401H201.531V1.93898H202.53C202.974 1.93898 203.363 2.2721 203.391 2.74404C203.391 3.07717 203.169 3.35477 202.863 3.46582L203.446 4.57625L202.919 4.60401ZM202.475 2.35539H202.031V3.16045H202.475C202.697 3.18821 202.891 3.04941 202.947 2.82732C202.974 2.60523 202.836 2.41091 202.614 2.35539H202.586C202.558 2.35539 202.503 2.35539 202.475 2.35539Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SuuntoLogo({
  className,
  tone = "auto",
}: {
  className?: string;
  tone?: LogoTone;
}) {
  return (
    <svg
      viewBox="0 0 150 49"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("inline-block shrink-0", logoToneClassName(tone), className)}
      aria-hidden="true"
    >
      <g fill="none" fillRule="evenodd">
        <path
          fill="#F03241"
          d="m74.46.115-9.51 13.58a.27.27 0 0 0 .222.425H84.19a.27.27 0 0 0 .222-.425L74.9.115a.27.27 0 0 0-.442 0"
        />
        <path
          fill="currentColor"
          d="M132.398 25.672c-7.001 0-12.246 5.023-12.246 11.585 0 6.562 5.245 11.584 12.246 11.584 7.002 0 12.247-5.022 12.247-11.584 0-6.562-5.245-11.585-12.247-11.585m0 19.057c-4.433 0-7.338-2.824-7.338-7.472 0-4.648 2.905-7.472 7.338-7.472 4.434 0 7.338 2.824 7.338 7.472 0 4.648-2.904 7.472-7.338 7.472m-69.842 4.112c-5.294 0-9.514-2.432-9.514-7.482V26.63c0-.173.14-.314.315-.314h3.982c.173 0 .315.14.315.315V40.51s-.195 4.241 4.833 4.241h.712c5.028 0 4.833-4.241 4.833-4.241V26.63c0-.174.141-.315.315-.315h3.982c.174 0 .315.14.315.315v14.73c0 5.049-4.22 7.481-9.515 7.481h-.573zm28.793-8.671L81.337 26.507a.474.474 0 0 0-.38-.192h-4a.314.314 0 0 0-.314.314v21.317c0 .174.14.315.315.315h3.982c.173 0 .315-.14.315-.315v-13.93c0-.153.195-.217.285-.093l10.189 14.143c.09.122.231.195.383.195h3.818c.174 0 .315-.14.315-.315V26.63a.315.315 0 0 0-.315-.314h-3.982a.314.314 0 0 0-.315.314v13.447a.158.158 0 0 1-.284.094m8.59-9.632h6.848c.174 0 .315.14.315.315v17.03c0 .174.141.315.315.315h3.93a.315.315 0 0 0 .315-.315v-17.03c0-.174.141-.315.315-.315h6.886a.315.315 0 0 0 .315-.315V26.62a.315.315 0 0 0-.315-.315H99.939a.315.315 0 0 0-.315.315v3.604c0 .174.14.315.315.315m-55.526 9.972s.195 4.241-4.833 4.241h-.712c-5.028 0-4.833-4.241-4.833-4.241V26.63a.314.314 0 0 0-.315-.315h-3.982a.314.314 0 0 0-.315.315v14.73c0 5.049 4.22 7.481 9.514 7.481h.573c5.295 0 9.515-2.432 9.515-7.482V26.63a.314.314 0 0 0-.315-.314h-3.982a.314.314 0 0 0-.315.315V40.51zm-26.157-5.298c-6.814-.93-7.798-1.55-7.798-3.05 0-2.14 3.223-2.664 5.111-2.664 3.275 0 5.173 1.422 5.784 2.098l.385.424a.313.313 0 0 0 .415.043l3.017-2.158a.316.316 0 0 0 .042-.477c-1.796-1.84-4.463-3.75-9.332-3.75-6.562.001-10.08 3.339-10.08 7.24 0 2.955 2.744 5.085 8.69 5.597 5.777.497 7.106 1.748 7.106 3.387 0 1.638-1.653 2.872-5.242 2.872-3.59 0-5.63-.687-7.02-1.911a6.395 6.395 0 0 1-.535-.522.314.314 0 0 0-.409-.053l-3.249 2.155a.316.316 0 0 0-.069.464l.427.515s2.753 3.418 9.8 3.418c7.047 0 10.99-3.272 10.99-7.55 0-3.835-3.772-5.497-8.033-6.078"
        />
      </g>
    </svg>
  );
}

function IntervalsIcuMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 163.28571 163.28572"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("block shrink-0", className)}
      aria-hidden="true"
    >
      <circle cx="81.642855" cy="81.64286" r="81.64" fill="#dd0447" />
      <g
        transform="matrix(1.504571,0,0,1.504571,6.462733,5.414828)"
        fill="#ffffff"
      >
        <path d="M 98.569,57.02 77.278,54.093 69.022,17.449 69.01,17.389 C 68.621,15.678 67.296,14.25 65.473,13.817 62.921,13.212 60.361,14.79 59.756,17.342 L 48.048,66.696 37.007,32.288 36.992,32.24 c -0.437,-1.327 -1.514,-2.415 -2.965,-2.803 -2.286,-0.612 -4.636,0.746 -5.247,3.032 L 22.842,54.662 1.464,57.02 c -0.633,0.07 -1.156,0.57 -1.229,1.229 -0.084,0.763 0.466,1.449 1.229,1.534 l 24.618,2.715 c 1.702,0.189 3.342,-0.871 3.825,-2.573 l 0.123,-0.434 3.177,-11.179 11.488,35.134 c 0.433,1.292 1.5,2.371 2.918,2.735 2.224,0.571 4.491,-0.769 5.062,-2.993 l 0.007,-0.026 11.338,-44.156 4.502,20.453 0.132,0.603 c 0.465,2.084 2.459,3.497 4.611,3.201 l 25.302,-3.479 c 0.604,-0.083 1.104,-0.558 1.191,-1.191 0.108,-0.765 -0.426,-1.468 -1.189,-1.573 z" />
      </g>
    </svg>
  );
}

function IntervalsIcuLogo({
  className,
  tone = "auto",
}: {
  className?: string;
  tone?: LogoTone;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[0.42em] whitespace-nowrap leading-none",
        logoToneClassName(tone),
        className,
      )}
    >
      <IntervalsIcuMark className="h-[1.12em] w-[1.12em]" />
      <span className="font-semibold tracking-[-0.03em]">intervals.icu</span>
    </span>
  );
}

const themedSvgLogoIds = new Set<IntegrationPlatform["id"]>([
  "polar",
  "wahoo",
  "whoop",
  "suunto",
  "intervals",
]);

function ThemedSvgLogo({
  platform,
  className,
  tone = "auto",
}: {
  platform: IntegrationPlatform;
  className?: string;
  tone?: LogoTone;
}) {
  if (platform.id === "polar") {
    return <PolarLogo tone={tone} className={className} />;
  }

  if (platform.id === "wahoo") {
    return <WahooLogo tone={tone} className={className} />;
  }

  if (platform.id === "whoop") {
    return <WhoopLogo tone={tone} className={className} />;
  }

  if (platform.id === "suunto") {
    return <SuuntoLogo tone={tone} className={className} />;
  }

  if (platform.id === "intervals") {
    return <IntervalsIcuLogo tone={tone} className={className} />;
  }

  return null;
}

function resolvePlatformSrc(platform: IntegrationPlatform, tone: LogoTone) {
  if (platform.srcLight && platform.srcDark) {
    if (tone === "light") {
      return platform.srcLight;
    }
    if (tone === "dark") {
      return platform.srcDark;
    }
  }

  return platform.src;
}

function IntegrationLogo({
  platform,
  className,
  tone = "auto",
}: {
  platform: IntegrationPlatform;
  className?: string;
  tone?: LogoTone;
}) {
  if (themedSvgLogoIds.has(platform.id)) {
    return (
      <span role="img" aria-label={platform.name} className="inline-flex">
        <ThemedSvgLogo platform={platform} tone={tone} className={className} />
      </span>
    );
  }

  if (platform.srcLight && platform.srcDark && tone === "auto") {
    return (
      <span role="img" aria-label={platform.name} className="inline-flex">
        <Image
          src={platform.srcLight}
          alt=""
          aria-hidden
          width={platform.width}
          height={platform.height}
          className={cn(className, "dark:hidden")}
        />
        <Image
          src={platform.srcDark}
          alt=""
          aria-hidden
          width={platform.width}
          height={platform.height}
          className={cn(className, "hidden dark:block")}
        />
      </span>
    );
  }

  return (
    <Image
      src={resolvePlatformSrc(platform, tone)}
      alt={platform.name}
      width={platform.width}
      height={platform.height}
      className={className}
    />
  );
}

export function HomeHeroWorksWith({
  label,
  moreLabel,
}: {
  label: string;
  moreLabel: string;
}) {
  return (
    <div className="w-full">
      <div className="text-center text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-6 opacity-80">
        {livePlatforms.map((platform) => (
          <IntegrationLogo
            key={platform.id}
            platform={platform}
            tone="auto"
            className={cn(
              platform.id === "intervals"
                ? "h-6 text-[18px] md:h-7 md:text-[20px]"
                : themedSvgLogoIds.has(platform.id)
                  ? "h-5 w-auto md:h-6"
                  : "h-auto w-20 object-contain brightness-0 dark:brightness-100 md:w-28",
            )}
          />
        ))}
        <span className="text-base text-muted-foreground">
          {moreLabel}
        </span>
      </div>
    </div>
  );
}

function showcaseLogoClasses(
  platform: IntegrationPlatform,
  { muted = false }: { muted?: boolean } = {},
) {
  return cn(
    "max-w-full object-contain transition-opacity duration-200",
    muted ? "opacity-50 hover:opacity-70" : "opacity-90 hover:opacity-100",
    platform.id === "strava" || platform.id === "garmin"
      ? "brightness-0 dark:brightness-100"
      : "",
    showcaseLogoClassName[platform.id],
  );
}

function PlatformLogoRow({
  platforms,
  muted = false,
  comingSoonLabel,
}: {
  platforms: IntegrationPlatform[];
  muted?: boolean;
  comingSoonLabel?: string;
}) {
  const isPlannedRow = Boolean(comingSoonLabel);

  return (
    <div
      className={cn(
        isPlannedRow &&
          "border-t border-border pt-10 md:pt-12",
      )}
    >
      {comingSoonLabel ? (
        <p className="mb-6 text-center text-sm font-medium text-muted-foreground">
          {comingSoonLabel}
        </p>
      ) : null}
      <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-8 sm:gap-x-10 md:gap-x-12 lg:gap-x-10 xl:gap-x-12">
        {platforms.map((platform) => (
          <li
            key={platform.id}
            className={cn(
              "flex shrink-0 items-center justify-center px-1",
              isPlannedRow ? "h-14 md:h-16" : "h-12 md:h-14",
            )}
            title={platform.name}
          >
            <IntegrationLogo
              platform={platform}
              tone="auto"
              className={showcaseLogoClasses(platform, { muted })}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HomePlatformShowcase({
  comingSoonLabel,
}: {
  comingSoonLabel: string;
}) {
  return (
    <div className="space-y-10 md:space-y-0">
      <PlatformLogoRow platforms={livePlatforms} />
      <PlatformLogoRow
        platforms={launchingPlatforms}
        muted
        comingSoonLabel={comingSoonLabel}
      />
    </div>
  );
}
