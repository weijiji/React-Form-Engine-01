import { useContext, useEffect, useState } from "react";
import type { User } from "form-engine-core";
import { FormEngineContext } from "../context";
import { FieldWrapper } from "../FieldWrapper";
import type { FieldComponent } from "../types";

/**
 * UserPicker — searches the org data source and stores the selected user id
 * (`string`, or `string[]` when `schema.multiple`). The data source is injected
 * via FormEngineContext (defaults to null → "unavailable").
 */
export const UserPicker: FieldComponent = ({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  disabled,
  schema,
}) => {
  const { orgDataSource } = useContext(FormEngineContext);
  const multiple = schema.multiple ?? false;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [selected, setSelected] = useState<User[]>([]);

  const currentIds = multiple
    ? Array.isArray(value)
      ? (value as string[]).filter((v): v is string => typeof v === "string")
      : []
    : typeof value === "string" && value !== ""
      ? [value]
      : [];

  const emit = (users: User[]) => {
    if (multiple) {
      onChange(users.map((u) => u.id));
    } else {
      onChange(users.length > 0 ? users[0].id : undefined);
    }
  };

  // Resolve already-stored ids to names when the data source is available.
  useEffect(() => {
    if (!orgDataSource) return;
    let cancelled = false;
    void (async () => {
      const resolved = await Promise.all(
        currentIds.map((uid) => orgDataSource.getUser(uid)),
      );
      if (!cancelled) {
        setSelected(resolved.filter((u): u is User => u !== null));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgDataSource, value]);

  const search = async (q: string) => {
    setQuery(q);
    if (!orgDataSource) return;
    if (q.trim() === "") {
      setResults([]);
      return;
    }
    const found = await orgDataSource.searchUsers(q);
    setResults(found);
  };

  const pick = (user: User) => {
    if (multiple) {
      const next = selected.some((u) => u.id === user.id)
        ? selected.filter((u) => u.id !== user.id)
        : [...selected, user];
      setSelected(next);
      emit(next);
    } else {
      setSelected([user]);
      emit([user]);
      setResults([]);
      setQuery(user.name);
    }
  };

  const remove = (userId: string) => {
    const next = selected.filter((u) => u.id !== userId);
    setSelected(next);
    emit(next);
  };

  return (
    <FieldWrapper
      id={id}
      label={label}
      required={schema.required}
      helpText={schema.helpText}
      error={error}
    >
      <div className="user-picker">
        {selected.map((user) => (
          <span className="user-chip" key={user.id}>
            {user.name}
            <button
              type="button"
              className="user-chip-remove"
              onClick={() => remove(user.id)}
              disabled={disabled}
              aria-label={`移除 ${user.name}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          type="text"
          className="form-control"
          value={query}
          placeholder={orgDataSource ? "搜索人员" : "组织数据源不可用"}
          disabled={disabled || !orgDataSource}
          onChange={(e) => void search(e.target.value)}
          onBlur={onBlur}
        />
        {results.length > 0 && (
          <ul className="user-results">
            {results.map((user) => (
              <li key={user.id}>
                <button type="button" onClick={() => pick(user)}>
                  {user.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </FieldWrapper>
  );
};
