import type { Peaks } from "./samples";
export interface WaveformProps {
    peaks: Peaks | null;
    /** The recording's length in seconds. */
    seconds: number;
    start: number;
    end: number;
    fadeIn: number;
    fadeOut: number;
    /** Called while a handle is dragged. */
    onChange?: (patch: {
        start?: number;
        end?: number;
    }) => void;
}
export declare function Waveform({ peaks, seconds, start, end, fadeIn, fadeOut, onChange }: WaveformProps): import("react").JSX.Element;
