import { useContext } from "react";
import { NSFWFilterContext } from "./NSFWContext";
import { NSFWContextType } from "../types";

export function useNSFWFilter(): NSFWContextType {
  const context = useContext(NSFWFilterContext);
  if (!context) {
    throw new Error("useNSFWFilter must be used within a NSFWFilterProvider");
  }
  return context;
}