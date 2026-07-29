"""
Train / retrain the behavioural traffic classifier from accumulated samples.

The labelled training store (`ml/data/traffic_samples.csv`) is grown
automatically by `detect()` during live capture: every flow it can name via the
SaaS catalog is recorded as `(behavioural features → catalog category)`, and
sanctioned-baseline flows as `benign`. In the bank-net deployment those are the
testbed's own flows — which is the "bank-net testbed only" training source.

So there's no separate dataset-building step: this script just (re)fits the model
on whatever has accumulated. Re-running it periodically IS the retrain mechanism
(the API's POST /api/classifier/retrain calls the same `train()`).

Usage
-----
    python ml/build_traffic_dataset.py          # train/retrain from the samples CSV
    python ml/build_traffic_dataset.py --stats  # show sample counts, don't train
"""
import sys
import os
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ml.traffic_classifier import train, load_meta, SAMPLES_CSV  # noqa: E402


def _stats() -> None:
    meta = load_meta()
    print(f"samples file : {SAMPLES_CSV}")
    print(f"exists       : {os.path.exists(SAMPLES_CSV)}")
    print(json.dumps(meta, indent=2))


def main() -> int:
    if "--stats" in sys.argv:
        _stats()
        return 0
    try:
        meta = train()
    except ValueError as exc:
        print(f"Cannot train yet: {exc}")
        print("Run a bank-net live scan first so detect() records samples, then retry.")
        return 1
    print("Trained behavioural traffic classifier:")
    print(json.dumps(meta, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
