import json
import os
import re # For basic keyword extraction
from typing import Dict, Any, Optional, List

CURRICULUM_FILE_PATH = os.path.join(os.path.dirname(__file__), 'curriculum_data.json')
_curriculum_data: Optional[Dict[str, Any]] = None

def load_curriculum_data() -> Dict[str, Any]:
    global _curriculum_data
    if _curriculum_data is None:
        try:
            with open(CURRICULUM_FILE_PATH, 'r') as f:
                _curriculum_data = json.load(f)
        except FileNotFoundError:
            print(f"ERROR: Curriculum data file not found at {CURRICULUM_FILE_PATH}")
            _curriculum_data = {}
        except json.JSONDecodeError:
            print(f"ERROR: Failed to decode curriculum data from {CURRICULUM_FILE_PATH}")
            _curriculum_data = {}
    return _curriculum_data

def get_subjects() -> List[str]:
    data = load_curriculum_data()
    return list(data.keys())

def get_grades_for_subject(subject: str) -> List[str]:
    data = load_curriculum_data()
    return list(data.get(subject, {}).keys())

def get_frameworks_for_grade(subject: str, grade: str) -> List[str]:
    data = load_curriculum_data()
    return list(data.get(subject, {}).get(grade, {}).keys())

def get_topics_for_framework(subject: str, grade: str, framework: str) -> List[str]:
    data = load_curriculum_data()
    return list(data.get(subject, {}).get(grade, {}).get(framework, {}).keys())

def get_standards_for_topic(subject: str, grade: str, framework: str, topic: str) -> Dict[str, Any]:
    data = load_curriculum_data()
    return data.get(subject, {}).get(grade, {}).get(framework, {}).get(topic, {})

def get_standard_details(standard_id: str) -> Optional[Dict[str, Any]]:
    data = load_curriculum_data()
    if not data: return None
    for subject_data in data.values():
        for grade_data in subject_data.values():
            for framework_data in grade_data.values():
                for topic_key, topic_data_val in framework_data.items():
                    if isinstance(topic_data_val, dict) and standard_id in topic_data_val:
                        return topic_data_val[standard_id]
    return None

def find_relevant_standards(
    query: str,
    user_grade: Optional[str],
    user_framework: Optional[str],
    user_subject: Optional[str] = None
) -> List[Dict[str, Any]]:
    data = load_curriculum_data()
    if not data:
        return []

    query_keywords = set(re.findall(r'\b\w{3,}\b', query.lower())) # Corrected regex
    if not query_keywords:
        return []

    relevant_standards = []

    subjects_to_search = [user_subject] if user_subject and user_subject in data else data.keys()

    for subject_name in subjects_to_search:
        subject_data = data.get(subject_name, {})

        grades_to_search = [user_grade] if user_grade and user_grade in subject_data else subject_data.keys()

        for grade_name in grades_to_search:
            grade_data = subject_data.get(grade_name, {})

            frameworks_to_search = [user_framework] if user_framework and user_framework in grade_data else grade_data.keys()

            for framework_name in frameworks_to_search:
                framework_data = grade_data.get(framework_name, {})

                for topic_name, topic_standards in framework_data.items():
                    if not isinstance(topic_standards, dict): continue

                    for standard_id, standard_info in topic_standards.items():
                        if not isinstance(standard_info, dict): continue

                        match_score = 0
                        standard_keywords = set(standard_info.get("keywords", []))
                        # Ensure description is string before re.findall
                        description_text = standard_info.get("description", "")
                        if not isinstance(description_text, str): description_text = ""
                        standard_description_words = set(re.findall(r'\b\w{3,}\b', description_text.lower())) # Corrected regex

                        for q_keyword in query_keywords:
                            if q_keyword in standard_keywords:
                                match_score += 2
                            if q_keyword in standard_description_words:
                                match_score += 1

                        if match_score > 0:
                            relevant_standards.append({
                                "standard_id": standard_id,
                                "description": standard_info.get("description"),
                                "keywords": standard_info.get("keywords"),
                                "topic": topic_name,
                                "framework": framework_name,
                                "grade": grade_name,
                                "subject": subject_name,
                                "score": match_score
                            })

    relevant_standards.sort(key=lambda x: x["score"], reverse=True)
    return relevant_standards

if __name__ == '__main__':
    print("Loading curriculum data...")
    data_loaded = load_curriculum_data()
    if not data_loaded:
        print("No curriculum data loaded. Exiting.")
    else:
        print("Curriculum data loaded successfully.")

        standard_id_to_test = "CCSS.MATH.CONTENT.5.NF.A.1"
        details = get_standard_details(standard_id_to_test)
        if details:
            print(f"Details for {standard_id_to_test}: {details.get('description')}")
        else:
            print(f"No details found for {standard_id_to_test}")

        print("\nTesting find_relevant_standards:")
        test_query = "How do I add fractions with unlike denominators?"
        # Assuming user profile might not always specify a subject, so function should handle it.
        found_standards = find_relevant_standards(test_query, "Grade 5", "Common Core", "Math")
        if found_standards:
            print(f"Found {len(found_standards)} relevant standards for query: '{test_query}' (Math, Grade 5, Common Core)")
            for std in found_standards[:3]: # Print top 3
                print(f"  ID: {std['standard_id']}, Score: {std['score']}, Desc: {std['description'][:60]}...")
        else:
            print(f"No standards found for query: '{test_query}' (Math, Grade 5, Common Core)")

        test_query_place_value = "what is place value in multi-digit numbers"
        found_standards_pv = find_relevant_standards(test_query_place_value, "Grade 5", "Common Core", "Math")
        if found_standards_pv:
            print(f"Found {len(found_standards_pv)} relevant standards for query: '{test_query_place_value}' (Math, Grade 5, Common Core)")
            for std in found_standards_pv[:3]:
                print(f"  ID: {std['standard_id']}, Score: {std['score']}, Desc: {std['description'][:60]}...")
        else:
            print(f"No standards found for query: '{test_query_place_value}' (Math, Grade 5, Common Core)")

        test_query_ela = "quoting accurately from text"
        found_standards_ela = find_relevant_standards(test_query_ela, "Grade 5", "Common Core", "English Language Arts")
        if found_standards_ela:
            print(f"Found {len(found_standards_ela)} relevant standards for ELA query: '{test_query_ela}' (ELA, Grade 5, Common Core)")
            for std in found_standards_ela[:3]:
                 print(f"  ID: {std['standard_id']}, Score: {std['score']}, Desc: {std['description'][:60]}...")
        else:
            print(f"No ELA standards found for query: '{test_query_ela}'")

        test_query_off_topic_math = "what is photosynthesis"
        found_standards_bio_math = find_relevant_standards(test_query_off_topic_math, "Grade 5", "Common Core", "Math")
        if not found_standards_bio_math:
            print(f"Correctly found no Math standards for bio query: '{test_query_off_topic_math}'")
        else:
            print(f"Incorrectly found Math standards for bio query: {found_standards_bio_math}")

        test_query_general_search = "fractions" # No grade/framework/subject specified to function
        found_standards_general = find_relevant_standards(test_query_general_search, None, None, None)
        if found_standards_general:
            print(f"Found {len(found_standards_general)} relevant standards for general query: '{test_query_general_search}' (any subject/grade/framework)")
            for std in found_standards_general[:3]: # Print top 3
                print(f"  S:{std['subject']} G:{std['grade']} F:{std['framework']} T:{std['topic']} ID: {std['standard_id']}, Score: {std['score']}")
        else:
            print(f"No standards found for general query: '{test_query_general_search}'")
