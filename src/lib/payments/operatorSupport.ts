export interface OperatorSupportConfig {
  enabled: boolean;
  lnurl: string;
  minimumSats: number;
  label: string;
}

interface OperatorSupportEnv {
  VITE_AGORAMESH_OPERATOR_LIGHTNING_ADDRESS?: string;
  VITE_AGORAMESH_OPERATOR_LNURL?: string;
  VITE_AGORAMESH_OPERATOR_SUPPORT_MIN_SATS?: string;
  VITE_AGORAMESH_OPERATOR_LABEL?: string;
}

const defaultMinimumSats = 5000;
const defaultEnv = ((import.meta as ImportMeta & { env?: OperatorSupportEnv }).env ?? {}) as OperatorSupportEnv;

export function operatorSupportConfig(env: OperatorSupportEnv = defaultEnv): OperatorSupportConfig {
  const lnurl = env.VITE_AGORAMESH_OPERATOR_LNURL?.trim() || env.VITE_AGORAMESH_OPERATOR_LIGHTNING_ADDRESS?.trim() || '';
  const parsedMinimum = Number(env.VITE_AGORAMESH_OPERATOR_SUPPORT_MIN_SATS ?? defaultMinimumSats);
  const minimumSats = Number.isInteger(parsedMinimum) && parsedMinimum > 0 ? parsedMinimum : defaultMinimumSats;
  return {
    enabled: Boolean(lnurl),
    lnurl,
    minimumSats,
    label: env.VITE_AGORAMESH_OPERATOR_LABEL?.trim() || 'AgoraMesh'
  };
}
