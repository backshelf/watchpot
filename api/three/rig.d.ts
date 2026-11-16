import { Vector3 } from "three/webgpu";
import { Glide, type GlideTiming, type Pose } from "./poses";
/** Who drives the camera: the rig, or a borrower. */
export interface CameraLoan {
    /** Asks for the camera; granted only while `canLend` says so. The rig stops writing it until it is given back. */
    borrow(): boolean;
    /** Gives the camera back, wherever it is: the rig glides on from there. */
    give(): void;
    /** Whether the borrower may still write the camera. False once given back or called in. */
    lent(): boolean;
    /** Ends the loan from the lender's side (the player walked away). */
    callIn(): void;
}
/** A camera loan, granted while `canLend()` is true. */
export declare function createCameraLoan(canLend?: () => boolean): CameraLoan;
/** The pointer as the rig reads it: across and up the canvas, -1..1. */
export interface RigPointer {
    x: number;
    y: number;
    /** In the window. */
    inside: boolean;
    /** The main button is down: the lean holds still so a press never swims. */
    pressed: boolean;
}
/** The camera the rig is about to set this frame; `adjust` may change any of it. */
export interface RigShot {
    readonly position: Vector3;
    readonly aim: Vector3;
    fov: number;
    /** Where depth of field will be sharp. */
    readonly focus: Vector3;
}
/** What `adjust` is told about the frame. */
export interface RigFrame {
    /** Real seconds, the stage clock's. */
    readonly now: number;
    readonly dt: number;
    readonly pose: Pose;
    readonly pointer: Readonly<RigPointer>;
    /** The glide has arrived. */
    readonly arrived: boolean;
    /** How far through the glide, 0..1. */
    readonly progress: number;
    /** The window's width over height. */
    readonly aspect: number;
}
/** What the rig takes. */
export interface CameraRigOptions {
    /** The pose wanted now, for a window of `aspect`; asked every frame. */
    readonly pose: (aspect: number) => Pose;
    /** How far the view leans toward the pointer, metres across and up, or null for none. Default [0.022, 0.012]. */
    readonly lean?: readonly [number, number] | null;
    /** How fast the lean follows the pointer, per second. Default 2.2. */
    readonly leanRate?: number;
    /** The player's sway setting, 0..1, read each frame and eased. Default 1. */
    readonly sway?: () => number;
    /** How fast the sway setting is eased in, per second. Default 8. */
    readonly swayRate?: number;
    /** A loan the rig honours. */
    readonly loan?: CameraLoan | null;
    /** Reduced motion. Default: the stage's. */
    readonly reduced?: boolean;
    /** How long glides take. */
    readonly timing?: GlideTiming;
    /** Changes the shot after the glide and before the lean (an edge glance, a held aim). */
    readonly adjust?: (shot: RigShot, frame: RigFrame) => void;
    /** Called once each time a glide arrives. */
    readonly onArrive?: () => void;
    /** Set the stage's focus from the pose, eased along the glide. Default true. */
    readonly focus?: boolean;
    /** The `useFrame` priority; anything that reads the camera after the rig runs above it. Default 0. */
    readonly priority?: number;
}
/** The rig's handle. */
export interface CameraRigHandle {
    /** The pointer as the rig last read it. */
    readonly pointer: Readonly<RigPointer>;
    /** The glide running, if any. */
    glide(): Glide | null;
    /** Next frame, glide to the pose from wherever the camera is now (after something else moved it). */
    restart(): void;
}
/** Drives the canvas's camera to `options.pose` every frame. Mount inside the stage. */
export declare function useCameraRig(options: CameraRigOptions): CameraRigHandle;
/** `useCameraRig` as a component. */
export declare function CameraRig(props: CameraRigOptions): null;
