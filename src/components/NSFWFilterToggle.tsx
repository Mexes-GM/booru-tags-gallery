import React from "react";
import { useTranslation } from "react-i18next";
import { useNSFWFilter } from "../context/useNSFWFilter";
import { cn } from "../utils/cn";

/**
 * "NSFW" switch next to the search box. On means sensitive previews are shown,
 * i.e. the filter is off — the same wording as Booru Prompt Gallery.
 */
const NSFWFilterToggle: React.FC = () => {
  const { t } = useTranslation();
  const { isNSFWFilterEnabled, toggleNSFWFilter, isToggling } = useNSFWFilter();
  const nsfwOn = !isNSFWFilterEnabled;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={nsfwOn}
      onClick={toggleNSFWFilter}
      disabled={isToggling}
      title={t("nsfw.switchTitle")}
      className="flex h-12 shrink-0 items-center gap-2.5 rounded-lg border border-input bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-wait disabled:opacity-60"
    >
      <span>{t("nsfw.short")}</span>
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-flex h-5 w-9 items-center rounded-full border transition-colors duration-150",
          nsfwOn ? "border-destructive bg-destructive" : "border-input bg-muted"
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 rounded-full bg-background shadow-sm transition-transform duration-150 ease-out-expo",
            nsfwOn ? "translate-x-4" : "translate-x-0.5"
          )}
        />
      </span>
    </button>
  );
};

export default NSFWFilterToggle;
