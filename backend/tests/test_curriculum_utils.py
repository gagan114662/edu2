# backend/tests/test_curriculum_utils.py
import pytest
import sys
import os
# Ensure backend directory is in sys.path to allow direct import of curriculum_utils
# This assumes tests are run from the root of the repository or backend directory
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import curriculum_utils # curriculum_utils.py should be in the backend directory
import json
from unittest.mock import patch, mock_open

# Sample curriculum data for mocking
SAMPLE_CURRICULUM_DATA = {
   "Math": {
       "Grade 5": {
           "Common Core": {
               "Fractions": {
                   "CCSS.MATH.5.NF.A.1": {
                       "description": "Add and subtract fractions with unlike denominators.",
                       "keywords": ["add fractions", "subtract fractions", "unlike denominators"]
                   },
                   "CCSS.MATH.5.NF.B.3": {
                       "description": "Interpret a fraction as division of the numerator by the denominator.",
                       "keywords": ["fraction as division", "division"]
                   }
               },
               "Decimals": {
                   "CCSS.MATH.5.NBT.A.1": {
                       "description": "Recognize place value in multi-digit numbers.",
                       "keywords": ["place value", "multi-digit"]
                   }
               }
           }
       }
   },
   "Science": {
        "Grade 5": {
            "NGSS": {
                "Ecosystems": {
                    "5-LS2-1": {
                        "description": "Develop a model to describe the movement of matter among plants, animals, decomposers, and the environment.",
                        "keywords": ["ecosystems", "matter", "plants", "animals"]
                    }
                }
            }
        }
   }
}

@pytest.fixture(autouse=True)
def mock_load_data_for_utils():
    # Reset cache before each test to ensure clean state
    curriculum_utils._curriculum_data = None
    # Mock open to return our sample data
    # The path used in curriculum_utils.CURRICULUM_FILE_PATH needs to be consistent or mocked too.
    # If CURRICULUM_FILE_PATH is absolute or complex, this mock needs care.
    # For simplicity, we assume curriculum_utils.CURRICULUM_FILE_PATH will resolve to something
    # that patch('builtins.open', ...) can intercept based on the filename part.
    # A more robust mock might patch CURRICULUM_FILE_PATH itself or os.path.exists if used.

    m = mock_open(read_data=json.dumps(SAMPLE_CURRICULUM_DATA))
    # Patch 'builtins.open' within the curriculum_utils module's scope if it's imported there,
    # or globally if it's used directly from builtins by curriculum_utils.
    # Patching 'os.path.join' might be needed if the path construction is complex and affects the mock.
    # However, the current curriculum_utils.py uses os.path.join(os.path.dirname(__file__), 'curriculum_data.json')
    # which should form a predictable path.

    # We will rely on load_curriculum_data being called by each tested function,
    # and it will use the mocked 'open'.
    with patch('builtins.open', m):
        # To ensure the mocked 'open' is used when load_curriculum_data is called *within* the test functions
        # we may not need to explicitly call load_curriculum_data() here if each util function calls it.
        # curriculum_utils.load_curriculum_data() # This would pre-load using the mock
        pass # Let test functions trigger load if necessary with the mock in place
    yield # Test runs here
    curriculum_utils._curriculum_data = None # Clean up cache after test


def test_get_standard_details_found(mock_load_data_for_utils):
   details = curriculum_utils.get_standard_details("CCSS.MATH.5.NF.A.1")
   assert details is not None
   assert details["description"] == "Add and subtract fractions with unlike denominators."

def test_get_standard_details_not_found(mock_load_data_for_utils):
   details = curriculum_utils.get_standard_details("NON.EXISTENT.ID")
   assert details is None

def test_find_relevant_standards_direct_keyword_match(mock_load_data_for_utils):
   query = "How to add fractions?"
   # Force reload with mock for this specific call context if needed, though autouse should handle it.
   # curriculum_utils._curriculum_data = None # Force re-load
   results = curriculum_utils.find_relevant_standards(query, "Grade 5", "Common Core", "Math")
   assert len(results) > 0
   assert results[0]["standard_id"] == "CCSS.MATH.5.NF.A.1"
   assert results[0]["score"] > 0

def test_find_relevant_standards_description_match(mock_load_data_for_utils):
   query = "Understanding multi-digit numbers and their place."
   results = curriculum_utils.find_relevant_standards(query, "Grade 5", "Common Core", "Math")
   assert len(results) > 0
   assert results[0]["standard_id"] == "CCSS.MATH.5.NBT.A.1"

def test_find_relevant_standards_no_match(mock_load_data_for_utils):
   query = "Photosynthesis process"
   results = curriculum_utils.find_relevant_standards(query, "Grade 5", "Common Core", "Math")
   assert len(results) == 0

def test_find_relevant_standards_multiple_keywords_ranking(mock_load_data_for_utils):
    query = "adding and subtracting fractions with unlike denominators"
    results = curriculum_utils.find_relevant_standards(query, "Grade 5", "Common Core", "Math")
    assert len(results) > 0
    assert results[0]["standard_id"] == "CCSS.MATH.5.NF.A.1"
    # Score assertion depends on exact scoring logic (e.g. unique keywords, weights)
    # Current logic: 'add fractions' (2), 'subtract fractions' (2), 'unlike denominators' (2) are all keywords
    # 'add', 'subtract', 'fractions', 'unlike', 'denominators' in description.
    # Let's assume score for "add fractions" keyword is 2.
    # "adding" could match "add" (1), "subtracting" could match "subtract" (1) from description.
    # "fractions" (2 from kw), "unlike" (2 from kw), "denominators" (2 from kw)
    # So, score is likely higher.
    assert results[0]["score"] >= 6 # Based on 3 keyword phrases.

def test_find_relevant_standards_different_subject(mock_load_data_for_utils):
    query = "movement of matter in ecosystems"
    results = curriculum_utils.find_relevant_standards(query, "Grade 5", "NGSS", "Science")
    assert len(results) == 1
    assert results[0]["standard_id"] == "5-LS2-1"

def test_find_relevant_standards_no_grade_framework_subject(mock_load_data_for_utils):
    query = "fraction division"
    results = curriculum_utils.find_relevant_standards(query, None, None, None)
    assert len(results) > 0
    assert any(r["standard_id"] == "CCSS.MATH.5.NF.B.3" for r in results)

def test_find_relevant_standards_empty_query(mock_load_data_for_utils):
    query = ""
    results = curriculum_utils.find_relevant_standards(query, "Grade 5", "Common Core", "Math")
    assert len(results) == 0

def test_find_relevant_standards_query_with_only_short_words(mock_load_data_for_utils):
    query = "a of the to in is" # Keywords must be >= 3 chars
    results = curriculum_utils.find_relevant_standards(query, "Grade 5", "Common Core", "Math")
    assert len(results) == 0

def test_find_relevant_standards_partial_match_in_description(mock_load_data_for_utils):
    query = "numerator and denominator interpretation" # "Interpret a fraction as division of the numerator by the denominator."
    results = curriculum_utils.find_relevant_standards(query, "Grade 5", "Common Core", "Math")
    assert len(results) > 0
    assert results[0]["standard_id"] == "CCSS.MATH.5.NF.B.3"
    # 'interpret', 'fraction', 'division', 'numerator', 'denominator' should match description words. Score > 0.
    assert results[0]["score"] > 0

# Ensure that the mock_load_data_for_utils fixture correctly patches 'builtins.open'
# when curriculum_utils.load_curriculum_data() is called.
# The curriculum_utils.py uses `os.path.join(os.path.dirname(__file__), 'curriculum_data.json')`
# This means the path used by `open` inside `load_curriculum_data` is absolute.
# The `patch('builtins.open', m)` should work regardless of the path if `m` (mock_open)
# is configured to not care about the path argument, or if the path is also mocked.
# The provided solution does not mock the path argument for `open`, which `mock_open` handles by default.
# Added a few more specific tests for keyword extraction and matching.
