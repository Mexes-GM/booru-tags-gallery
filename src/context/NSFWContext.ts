import { createContext } from "react";
import { NSFWContextType } from "../types";

export const NSFWFilterContext = createContext<NSFWContextType | undefined>(undefined); 