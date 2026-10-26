import type { InjectFace, PropsLocale, PropsRenderFactories, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { TaskFace } from './controller.js';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        'teamDsh.task.conversation': {
            kind: 'single';
            scope: 'session';
            owner: Record<never, never>;
        };
    }
}
type PanelProps = InjectFace<TaskFace> & PropsLocale<'teamDsh'> & PropsRenderSlots<'teamDsh.task.conversation'>;
/** Render the native chat assembly inside the selected Session scope. */
export declare function TaskConversation({ renderFactorySlot }: PropsRuntime<'teamDsh.task.conversation'> & PropsRenderFactories): import("react").ReactNode;
/** Display one-line creation, manual completion, and the selected conversation. */
export declare function TaskPanel(props: PanelProps): import("react/jsx-runtime").JSX.Element;
export {};
