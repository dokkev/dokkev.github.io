"""Information-boundary and causality checks for the optional observer study."""
import numpy as np
import pytest

torch = pytest.importorskip("torch")
from til.observer import Observer, fit_scaler, windows, baseline_predictions


def run(split, value):
    return dict(id=split, split=split, x=np.full((150, 4), value, dtype=np.float32),
                y=np.full((150, 2), value, dtype=np.float32))


def test_scaling_and_windows_do_not_read_held_out_targets():
    train = run("train", 1.)
    test = run("test_contact", 999.)
    scaler = fit_scaler([train, test])
    np.testing.assert_array_equal(scaler["x_mean"], 1.)
    x, y = windows([train, test], scaler)
    assert x.shape == (1, 128, 4)
    assert y.shape == (1, 128, 2)
    assert torch.count_nonzero(x) == 0
    assert torch.count_nonzero(y) == 0


def test_gru_is_causal_and_streaming_matches_full_sequence():
    torch.manual_seed(1)
    model = Observer(hidden=8).eval()
    x = torch.randn(1, 20, 4)
    changed = x.clone()
    changed[:, 10:] = 100.
    with torch.no_grad():
        original, _ = model(x)
        perturbed, _ = model(changed)
        left, hidden = model(x[:, :10])
        right, _ = model(x[:, 10:], hidden)
    torch.testing.assert_close(original[:, :10], perturbed[:, :10])
    torch.testing.assert_close(original, torch.cat((left, right), dim=1))
