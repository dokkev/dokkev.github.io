"""One-factor telemetry tests with identical physical trajectories and common random numbers."""
import argparse,copy,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from til.phase3 import base_episode,run_episode,design
from til.recorder import DatasetFile,normalize_episode_units


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--out",required=True);a=ap.parse_args()
    Path(a.out).parent.mkdir(parents=True,exist_ok=True);ds=DatasetFile(a.out)
    try:
        for contact in (False,True):
            base=base_episode("C_passive",int(contact),"test");base.seed+=8000
            base.profile.amplitude=.016;base.profile.period=2.
            for factor,values in (("current_white_noise_A",(0.,.005,.02)),("telemetry_delay_s",(0.,.001,.005))):
                for value in values:
                    ep=copy.deepcopy(base);ep.scenario_id="test_sensor"
                    ep.episode_id=f"p3_sensor_{'contact' if contact else 'free'}_{factor}_{value:g}"
                    ep.metadata.update(sensitivity_factor=factor,sensitivity_value=value)
                    if factor=="current_white_noise_A":ep.sim_overrides["motor"]["current_noise"]=value
                    else:ep.sim_overrides["motor_sensor"]["delay"]=value
                    print(ep.episode_id,flush=True)
                    writer=ds.episode(ep.episode_id,ep.to_dict());run_episode(ep,writer)
        normalize_episode_units(ds.f)
    finally:ds.close()


if __name__=="__main__":main()
