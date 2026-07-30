import { useReducer, type ComponentType } from "react";

export interface WebGlRemountProps {
  remount: () => void;
}

function increment(c: number) {
  return c + 1;
}

export default function withWebGlRemount<P extends WebGlRemountProps>(
  Body: ComponentType<P>,
) {
  function WebGlRemountContainer(_props: Omit<P, keyof WebGlRemountProps>) {
    const [key, remount] = useReducer(increment, 0);

    const eventHandlerProps: WebGlRemountProps = {
      remount,
    };

    const props = {
      ..._props,
      ...eventHandlerProps,
    } as P;

    return <Body key={key} {...props} />;
  }
  WebGlRemountContainer.displayName = `withWebGlRemount(${Body.displayName ?? Body.name})`;
  return WebGlRemountContainer;
}
