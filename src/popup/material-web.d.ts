import type { DetailedHTMLProps, HTMLAttributes } from "react";

type MaterialWebElementProps = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  [key: string]: unknown;
  checked?: boolean;
  disabled?: boolean;
  error?: boolean;
  label?: string;
  max?: number | string;
  min?: number | string;
  open?: boolean;
  selected?: boolean;
  type?: string;
  value?: string | number;
};

declare global {
  namespace JSX {
    interface IntrinsicElements {
      [tagName: string]: MaterialWebElementProps;
    }
  }
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      [tagName: string]: MaterialWebElementProps;
    }
  }
}

declare module "react/jsx-runtime" {
  namespace JSX {
    interface IntrinsicElements {
      [tagName: string]: MaterialWebElementProps;
    }
  }
}
