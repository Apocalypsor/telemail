import { extractErrorMessage } from "@page/api/utils";
import { useEffect, useState } from "react";

interface ErrorBoxProps {
  error: unknown;
  fallback: string;
}

export const ErrorBox = ({ error, fallback }: ErrorBoxProps) => {
  const [message, setMessage] = useState(fallback);

  useEffect(() => {
    let cancelled = false;
    extractErrorMessage(error).then((msg) => {
      if (!cancelled) setMessage(msg);
    });
    return () => {
      cancelled = true;
    };
  }, [error]);

  return (
    <div className="rounded-2xl border border-red-900/50 bg-red-950/30 p-10 text-center text-sm text-red-400">
      {message}
    </div>
  );
};
