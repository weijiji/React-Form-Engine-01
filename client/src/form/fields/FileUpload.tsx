import { useRef, useState } from "react";
import { FieldWrapper } from "../FieldWrapper";
import type { FieldComponent } from "../types";

/** Normalize an allow-list entry the same way the engine does (lower, strip dot). */
function normalizeType(type: string): string {
  return type.toLowerCase().trim().replace(/^\./, "");
}

function matchesType(file: File, allowTypes: string[]): boolean {
  const allowed = allowTypes.map(normalizeType);
  const mime = (file.type || "").toLowerCase();
  const ext = file.name.includes(".")
    ? file.name.slice(file.name.lastIndexOf(".") + 1).toLowerCase()
    : "";
  return allowed.includes(mime) || allowed.includes(ext);
}

export const FileUpload: FieldComponent = ({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  disabled,
  schema,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rejectedNotice, setRejectedNotice] = useState<string | null>(null);

  const files = Array.isArray(value) ? (value as File[]) : [];
  const { allowTypes, maxSizeMB, maxCount } = schema;

  const handleSelect = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    const accepted: File[] = [];
    let rejected = 0;

    for (const file of incoming) {
      const overCount =
        maxCount !== undefined && files.length + accepted.length >= maxCount;
      const overSize =
        maxSizeMB !== undefined && file.size > maxSizeMB * 1024 * 1024;
      const badType =
        allowTypes !== undefined &&
        allowTypes.length > 0 &&
        !matchesType(file, allowTypes);

      if (overCount || overSize || badType) {
        rejected += 1;
        continue;
      }
      accepted.push(file);
    }

    if (rejected > 0) {
      setRejectedNotice(`已拦截 ${rejected} 个不符合要求的文件`);
    } else {
      setRejectedNotice(null);
    }
    if (accepted.length > 0) {
      onChange([...files, ...accepted]);
    }
  };

  const removeAt = (index: number) => {
    onChange(files.filter((_, i) => i !== index));
  };

  return (
    <FieldWrapper
      id={id}
      label={label}
      required={schema.required}
      helpText={schema.helpText}
      error={error}
    >
      <div className="file-upload">
        <input
          ref={inputRef}
          id={id}
          type="file"
          multiple
          disabled={disabled}
          onChange={(e) => {
            handleSelect(e.target.files);
            e.target.value = ""; // allow re-selecting the same file
          }}
          onBlur={onBlur}
        />
        {files.length > 0 && (
          <ul className="file-list">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="file-item">
                <span className="file-name">{file.name}</span>
                <button
                  type="button"
                  className="file-remove"
                  onClick={() => removeAt(index)}
                  disabled={disabled}
                  aria-label={`移除 ${file.name}`}
                >
                  移除
                </button>
              </li>
            ))}
          </ul>
        )}
        {rejectedNotice && <p className="form-error">{rejectedNotice}</p>}
      </div>
    </FieldWrapper>
  );
};
