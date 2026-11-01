"""Generate a small floating-base pose cycle under two fixed foot contacts.

This integrates TSID accelerations; it is not a contact physics simulation.
No hardware or viewer is accessed. Forces act on the robot.
"""

import argparse
import json
import hashlib
from pathlib import Path
import sys

import numpy as np
import pinocchio as pin
import tsid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path('/tmp/wbc01-balance.npz'))
    parser.add_argument('--playback-json', type=Path, help='Optional compact browser playback data')
    parser.add_argument('--duration', type=float, default=8.0)
    parser.add_argument('--motion', choices=['x', 'y', 'z', 'roll', 'pitch', 'yaw', 'combined'], default='combined')
    args = parser.parse_args()
    dt = 0.001
    if not np.isfinite(args.duration) or args.duration < 7.0:
        parser.error('duration must be finite and at least 7 seconds')
    model_root = Path(sys.prefix) / 'share/example-robot-data/robots/talos_data'
    urdf = model_root / 'robots/talos_reduced.urdf'
    robot = tsid.RobotWrapper(str(urdf), [str(model_root.parent.parent)], pin.JointModelFreeFlyer(), False)
    model = robot.model()
    pin.loadReferenceConfigurations(model, str(model_root / 'srdf/talos.srdf'), False)
    q = model.referenceConfigurations['half_sitting'].copy()
    v = np.zeros(model.nv)
    formulation = tsid.InverseDynamicsFormulationAccForce('reach', robot, False)
    formulation.computeProblemData(0.0, q, v)
    foot_names = ['leg_left_sole_fix_joint', 'leg_right_sole_fix_joint']
    foot_ids = [model.getFrameId(name) for name in foot_names]
    hand_name = 'gripper_right_joint'
    if not model.existFrame(hand_name):
        raise RuntimeError(f'Missing hand frame: {hand_name}')
    hand_id = model.getFrameId(hand_name)
    q[2] -= robot.framePosition(formulation.data(), foot_ids[0]).translation[2]
    formulation.computeProblemData(0.0, q, v)
    contacts = []
    foot_references = []
    # Sole-local support rectangle, matching the upstream Talos exercise.
    points = np.array([[-0.10, -0.10, 0.10, 0.10], [-0.065, 0.065, -0.065, 0.065], [0., 0., 0., 0.]])
    for name, frame_id in zip(foot_names, foot_ids):
        contact = tsid.Contact6d(name, robot, name, points, np.array([0., 0., 1.]), 0.3, 5., 1000.)
        contact.setKp(np.full(6, 100.))
        contact.setKd(np.full(6, 20.))
        reference = robot.framePosition(formulation.data(), frame_id).copy()
        contact.setReference(reference)
        formulation.addRigidContact(contact, 1e-5)
        contacts.append(contact)
        foot_references.append(reference)

    com_reference = robot.com(formulation.data()).copy()
    base_id = model.getFrameId('base_link')
    if not model.existFrame('base_link'):
        raise RuntimeError('Missing pelvis/base frame')
    base_initial = robot.framePosition(formulation.data(), base_id).copy()
    base_task = tsid.TaskSE3Equality('base-pose', robot, 'base_link')
    base_task.setKp(np.full(6, 100.))
    base_task.setKd(np.full(6, 20.))
    base_task.useLocalFrame(False)
    formulation.addMotionTask(base_task, 10., 1, 0.)
    base_trajectory = tsid.TrajectorySE3Constant('base-ref', base_initial)
    translation = np.zeros(3)
    rotation = np.zeros(3)
    if args.motion in ['x', 'y', 'z']:
        translation[['x', 'y', 'z'].index(args.motion)] = 0.015 if args.motion == 'z' else 0.02
    elif args.motion in ['roll', 'pitch', 'yaw']:
        rotation[['roll', 'pitch', 'yaw'].index(args.motion)] = np.deg2rad(3.)
    else:
        translation[:] = [0.015, 0.01, 0.]
        rotation[:] = [0., np.deg2rad(2.), np.deg2rad(2.)]

    posture_task = tsid.TaskJointPosture('posture', robot)
    posture_task.setKp(np.full(robot.na, 10.))
    posture_task.setKd(np.full(robot.na, 2 * np.sqrt(10.)))
    posture_task.setReference(tsid.TrajectoryEuclidianConstant('posture-ref', q[7:]).computeNext())
    formulation.addMotionTask(posture_task, 1e-3, 1, 0.)

    torque_limit = model.effortLimit[-robot.na:].copy()
    torque_bounds = tsid.TaskActuationBounds('torque-bounds', robot)
    torque_bounds.setBounds(-torque_limit, torque_limit)
    formulation.addActuationTask(torque_bounds, 1., 0, 0.)
    joint_bounds = tsid.TaskJointBounds('joint-bounds', robot, dt)
    q_lower = model.lowerPositionLimit[-robot.na:]
    q_upper = model.upperPositionLimit[-robot.na:]
    joint_bounds.setVelocityBounds(-model.velocityLimit[-robot.na:], model.velocityLimit[-robot.na:])
    formulation.addMotionTask(joint_bounds, 1., 0, 0.)
    solver = tsid.SolverHQuadProgFast('solver')
    solver.resize(formulation.nVar, formulation.nEq, formulation.nIn)
    data = model.createData()
    records = []
    max_dynamics_residual = 0.
    max_contact_acceleration = 0.
    max_torque_ratio = 0.
    max_foot_drift = 0.
    max_force_constraint_violation = 0.

    for step in range(round(args.duration / dt) + 1):
        t = step * dt
        # One smooth signed cycle: neutral -> positive -> negative -> neutral.
        u = t / args.duration
        phase = 2 * np.pi * (10*u**3 - 15*u**4 + 6*u**5)
        phase_v = 2 * np.pi * (30*u**2 - 60*u**3 + 30*u**4) / args.duration
        phase_a = 2 * np.pi * (60*u - 180*u**2 + 120*u**3) / args.duration**2
        blend = np.sin(phase)
        blend_v = np.cos(phase) * phase_v
        blend_a = -np.sin(phase) * phase_v**2 + np.cos(phase) * phase_a
        target = base_initial.copy()
        target.translation += translation * blend
        target.rotation = pin.exp3(rotation * blend) @ base_initial.rotation
        base_trajectory.setReference(target)
        sample = base_trajectory.computeNext()
        sample.derivative(np.concatenate([translation, rotation]) * blend_v)
        sample.second_derivative(np.concatenate([translation, rotation]) * blend_a)
        base_task.setReference(sample)
        # Critically damped acceleration bounds approach model position limits.
        damping = 2 * np.sqrt(80.) * v[-robot.na:]
        joint_bounds.setAccelerationBounds(
            np.maximum(-50., 80. * (q_lower - q[-robot.na:]) - damping),
            np.minimum(50., 80. * (q_upper - q[-robot.na:]) - damping))
        problem = formulation.computeProblemData(t, q, v)
        solution = solver.solve(problem)
        if solution.status != 0:
            raise RuntimeError(f'TSID failed at {t:.3f} s: status {solution.status}; no output written')
        dv = formulation.getAccelerations(solution).copy()
        tau = formulation.getActuatorForces(solution).copy()
        if not all(np.all(np.isfinite(x)) for x in (q, v, dv, tau)):
            raise RuntimeError(f'Nonfinite state or solution at {t:.3f} s')

        pin.computeAllTerms(model, data, q, v)
        pin.updateFramePlacements(model, data)
        pin.computeJointJacobiansTimeVariation(model, data, q, v)
        external_generalized_force = np.zeros(model.nv)
        forces_world = []
        contact_error = 0.
        foot_drift = 0.
        for contact, frame_id, reference in zip(contacts, foot_ids, foot_references):
            point_forces = formulation.getContactForce(contact.name, solution)
            if not np.all(np.isfinite(point_forces)):
                raise RuntimeError(f"Nonfinite contact force at {t:.3f} s")
            force_constraint = contact.computeForceTask(t, q, v, formulation.data())
            force_values = force_constraint.matrix @ point_forces
            violation = max(0., np.max(force_constraint.lowerBound - force_values),
                            np.max(force_values - force_constraint.upperBound))
            max_force_constraint_violation = max(max_force_constraint_violation, violation)
            wrench_local = contact.getForceGeneratorMatrix @ point_forces
            jacobian = pin.getFrameJacobian(model, data, frame_id, pin.LOCAL)
            jacobian_dot = pin.getFrameJacobianTimeVariation(model, data, frame_id, pin.LOCAL)
            external_generalized_force += jacobian.T @ wrench_local
            forces_world.append(data.oMf[frame_id].rotation @ wrench_local[:3])
            contact_error = max(contact_error, np.linalg.norm(jacobian @ dv + jacobian_dot @ v))
            foot_drift = max(foot_drift, np.linalg.norm(pin.log6(reference.inverse() * data.oMf[frame_id]).vector))
        actuator_generalized_force = np.concatenate([np.zeros(6), tau])
        residual = data.M @ dv + data.nle - actuator_generalized_force - external_generalized_force
        max_dynamics_residual = max(max_dynamics_residual, np.linalg.norm(residual, np.inf))
        max_contact_acceleration = max(max_contact_acceleration, contact_error)
        max_foot_drift = max(max_foot_drift, foot_drift)
        max_torque_ratio = max(max_torque_ratio, np.max(np.abs(tau) / torque_limit))
        if step % 40 == 0:
            records.append(dict(time=t, q=q.copy(), v=v.copy(), dv=dv, tau=tau,
                com=robot.com(formulation.data()).copy(), hand=data.oMf[hand_id].translation.copy(),
                hand_target=data.oMf[hand_id].translation.copy(),
                base=pin.SE3ToXYZQUAT(data.oMf[base_id]), base_target=pin.SE3ToXYZQUAT(target),
                base_position_error=float(np.linalg.norm(data.oMf[base_id].translation-target.translation)),
                base_rotation_error=float(np.linalg.norm(pin.log3(target.rotation @ data.oMf[base_id].rotation.T))), foot_force_world=np.array(forces_world),
                foot_positions_world=np.array([data.oMf[i].translation.copy() for i in foot_ids]),
                joint_poses=np.array([pin.SE3ToXYZQUAT(pose) for pose in data.oMi]),
                dynamics_residual_inf=np.linalg.norm(residual, np.inf),
                contact_acceleration_norm=contact_error))
        if np.any(q[-robot.na:] < q_lower - 1e-5) or np.any(q[-robot.na:] > q_upper + 1e-5):
            raise RuntimeError(f'Joint position limit crossed at {t:.3f} s')
        q = pin.integrate(model, q, dt * (v + 0.5 * dt * dv))
        v = v + dt * dv

    metadata = dict(model='talos_reduced', pinocchio=pin.__version__, tsid=json.loads(next((Path(sys.prefix) / 'conda-meta').glob('tsid-*.json')).read_text())['version'],
        urdf_sha256=hashlib.sha256(urdf.read_bytes()).hexdigest(),
        balance_policy='base-pose-with-fixed-feet', task_priority={'hard': ['contacts', 'torque and joint bounds'], 'soft': ['base pose', 'posture']}, com_reference=com_reference.tolist(),
        dt=dt, sample_dt=40*dt, motion=args.motion, translation_amplitude_m=translation.tolist(), rotation_amplitude_rad=rotation.tolist(), gravity=model.gravity.linear.tolist(),
        foot_frames=foot_names, hand_frame=hand_name, joint_names=list(model.names),
        joint_parents=model.parents.tolist(), pose_order='x y z qx qy qz qw',
        force_frame='world', force_meaning='ground force on robot, summed per foot',
        model_assumptions='fixed rigid contacts; integrated TSID acceleration; no collision simulation; joint position/velocity/acceleration bounds enabled; no collision bounds',
        max_force_constraint_violation=float(max_force_constraint_violation),
        max_dynamics_residual_inf=float(max_dynamics_residual),
        max_contact_acceleration_norm=float(max_contact_acceleration),
        max_foot_pose_log_norm=float(max_foot_drift), max_torque_ratio=float(max_torque_ratio),
        max_base_position_error_m=max(r['base_position_error'] for r in records),
        max_base_rotation_error_rad=max(r['base_rotation_error'] for r in records),
        base_reference=pin.SE3ToXYZQUAT(base_initial).tolist())
    if max_dynamics_residual > 1e-5 or max_torque_ratio > 1.00001 or max_foot_drift > 1e-3 or max_contact_acceleration > 1e-3 or max_force_constraint_violation > 1e-5:
        raise RuntimeError(f'Consistency check failed; no output written: {metadata}')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(args.output, **{key: np.array([r[key] for r in records]) for key in records[0]}, metadata=json.dumps(metadata))
    if args.playback_json:
        playback_fields = ['time', 'com', 'hand', 'hand_target', 'foot_force_world', 'foot_positions_world', 'base', 'base_target']
        frames = [{**{key: np.round(r[key], 6).tolist() for key in playback_fields},
                   'joint_poses': np.round(r['joint_poses'], 6).tolist()} for r in records]
        args.playback_json.parent.mkdir(parents=True, exist_ok=True)
        args.playback_json.write_text(json.dumps(dict(metadata=metadata, frames=frames), separators=(',', ':'), allow_nan=False))
    print(json.dumps(metadata, indent=2))
    print(f'Saved {len(records)} frames to {args.output}')


if __name__ == '__main__':
    main()
