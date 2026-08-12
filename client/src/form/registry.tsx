import type { FieldError, FieldSchema, FieldType } from "form-engine-core";
import { CheckboxGroup } from "./fields/CheckboxGroup";
import { DatePicker } from "./fields/DatePicker";
import { DateTimePicker } from "./fields/DateTimePicker";
import { FileUpload } from "./fields/FileUpload";
import { InfoText } from "./fields/InfoText";
import { NumberInput } from "./fields/NumberInput";
import { RadioGroup } from "./fields/RadioGroup";
import { SectionField } from "./fields/Section";
import { Select } from "./fields/Select";
import { SubForm } from "./fields/SubForm";
import { TextArea } from "./fields/TextArea";
import { TextInput } from "./fields/TextInput";
import { UserPicker } from "./fields/UserPicker";
import type { FieldComponent, FieldComponentProps } from "./types";

/** fieldType → Component. Extending the engine = registering a new entry here. */
export const ComponentRegistry: Record<FieldType, FieldComponent> = {
  text: TextInput,
  textarea: TextArea,
  number: NumberInput,
  select: Select,
  radio: RadioGroup,
  checkbox: CheckboxGroup,
  date: DatePicker,
  datetime: DateTimePicker,
  file: FileUpload,
  subform: SubForm,
  "user-picker": UserPicker,
  section: SectionField,
  "info-text": InfoText,
};

export interface ComponentFactoryProps {
  field: FieldSchema;
  id: string;
  value: unknown;
  error?: FieldError[];
  disabled: boolean;
  onChange: (value: unknown) => void;
  onBlur: () => void;
}

/**
 * ComponentFactory — instantiates the component for a field and injects the
 * uniform FieldComponentProps contract (design spec §2.1.5). Convenience props
 * (`label`, `placeholder`, `options`, `validation`) are read from the schema.
 */
export function ComponentFactory({
  field,
  id,
  value,
  error,
  disabled,
  onChange,
  onBlur,
}: ComponentFactoryProps): React.ReactElement {
  const Component = ComponentRegistry[field.type];
  if (!Component) {
    throw new Error(`No component registered for field type "${field.type}"`);
  }

  const props: FieldComponentProps = {
    id,
    label: field.label,
    value,
    onChange,
    onBlur,
    error,
    disabled,
    placeholder: field.placeholder,
    options: field.options,
    validation: field.validation,
    schema: field,
  };

  return <Component {...props} />;
}
