"use client";

import { useActionState, useEffect } from "react";
import { createClassAction } from "@/app/actions/classes";

interface CreateClassFormProps {
  onSuccess: (name: string) => void;
  onError: (msg: string) => void;
}

export function CreateClassForm({ onSuccess, onError }: CreateClassFormProps) {
  const [state, action, pending] = useActionState(createClassAction, null);

  useEffect(() => {
    if (state?.success) {
      onSuccess("");
    }
  }, [state?.success, onSuccess]);

  useEffect(() => {
    if (state?.error) {
      onError(state.error);
    }
  }, [state?.error, onError]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium">
          Class name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
          placeholder="e.g. Math 101"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="flex h-9 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {pending ? "Creating..." : "Create class"}
      </button>
    </form>
  );
}
