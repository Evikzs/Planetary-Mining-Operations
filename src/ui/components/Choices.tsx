/** Radio buttons drawn as one segmented control. */
export function Choices<T extends string>(props: {
  legend: string;
  name: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset class="field-set">
      <legend>{props.legend}</legend>
      <div class="choices">
        {props.options.map((o) => (
          <label key={o.id} class="choice">
            <input
              type="radio"
              name={props.name}
              checked={props.value === o.id}
              onChange={() => props.onChange(o.id)}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
