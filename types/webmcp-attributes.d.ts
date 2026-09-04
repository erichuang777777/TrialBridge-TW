import "react";

declare module "react" {
  interface FormHTMLAttributes<T> {
    /** Optional discovery metadata for the page location of a declarative tool. */
    toollocation?: string;
    /** Optional discovery metadata describing the visible action. */
    toolaction?: string;
  }
}
