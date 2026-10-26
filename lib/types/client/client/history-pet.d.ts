import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { HistoryPetFace } from './history-controller.js';
type Props = PropsRuntime<'shell.overlay'> & PropsLocale<'teamDsh'> & InjectFace<HistoryPetFace> & {
    refreshSessions(): Promise<void>;
};
/** Keep the pet movable while the native Modal owns selection and keyboard focus. */
export declare function HistoryPet(props: Props): import("react/jsx-runtime").JSX.Element;
export {};
