from app.integrations.langsmith import to_generic_trace
from app.models import IngestRequest
from app.normalize.generic import parse
from app.pipeline import run_pipeline
from tests.conftest import FakeSupabase


def test_root_and_children_become_one_generic_trace_with_usage() -> None:
    trace = to_generic_trace(
        {
            "id": "root",
            "trace_id": "trace-1",
            "run_type": "chain",
            "name": "Support agent",
            "inputs": {"ticket": "42"},
        },
        [
            {
                "id": "model",
                "trace_id": "trace-1",
                "parent_run_id": "root",
                "run_type": "llm",
                "name": "gpt",
                "inputs": {"prompt": "hello"},
                "outputs": {"answer": "world"},
                "usage_metadata": {"input_tokens": 11, "output_tokens": 7},
            },
        ],
    )

    parsed = parse(trace)
    assert parsed.trace_id == "trace-1"
    assert len(parsed.spans) == 2
    assert parsed.spans[1].parent_id == "root"
    assert (parsed.spans[1].tokens_in, parsed.spans[1].tokens_out) == (11, 7)
    assert parsed.spans[1].token_source == "measured"


def test_missing_langsmith_usage_uses_existing_estimation_path() -> None:
    trace = to_generic_trace(
        {"id": "root", "trace_id": "trace-1", "run_type": "llm", "inputs": {"x": "hello"}},
        [],
    )
    assert parse(trace).spans[0].token_source == "estimated"


def test_langsmith_trace_is_redacted_before_database_insert(fake_db: FakeSupabase) -> None:
    trace = to_generic_trace(
        {"id": "root", "trace_id": "trace-1", "run_type": "llm", "inputs": {"key": "sk-FAKE000000000000000000000000"}},
        [],
    )
    run_pipeline(
        IngestRequest(
            source="langsmith",
            format="generic",
            trace=trace,
        ),
        user_id="11111111-1111-1111-1111-111111111111",
        langsmith_connection_id="22222222-2222-2222-2222-222222222222",
        external_trace_id="trace-1",
    )
    assert "sk-FAKE000000000000000000000000" not in fake_db.dump()
