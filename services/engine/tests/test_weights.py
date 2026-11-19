from app.preferences import question_list, weights_from_answers


def test_answers_change_weights():
    worker = weights_from_answers({"deskHours": "gt4", "guests": "rare"})
    host = weights_from_answers({"deskHours": "lt1", "guests": "weekly"})
    assert worker["monitorGlare"] > host["monitorGlare"]
    assert host["openness"] > worker["openness"]


def test_unknown_answers_are_ignored():
    assert weights_from_answers({"nope": "x"}) == weights_from_answers({})


def test_question_list_has_labels():
    qs = question_list()
    assert len(qs) >= 3
    assert all(q["label"] and q["options"] for q in qs.values())
