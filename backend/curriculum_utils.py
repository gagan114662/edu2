import json
import os
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
            # In a real app, might raise an error or log critical failure
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
    for subject_data in data.values():
        for grade_data in subject_data.values():
            for framework_data in grade_data.values():
                for topic_data in framework_data.values():
                    if standard_id in topic_data:
                        return topic_data[standard_id]
    return None

# Example usage (optional, for testing this file directly)
if __name__ == '__main__':
    print("Loading curriculum data...")
    data = load_curriculum_data()
    if not data:
        print("No curriculum data loaded. Exiting.")
    else:
        print("Curriculum data loaded successfully.")
        print(f"Subjects: {get_subjects()}")
        if "Math" in get_subjects():
            print(f"Grades for Math: {get_grades_for_subject('Math')}")
            if "Grade 5" in get_grades_for_subject('Math'):
                print(f"Frameworks for Math, Grade 5: {get_frameworks_for_grade('Math', 'Grade 5')}")
                if "Common Core" in get_frameworks_for_grade('Math', 'Grade 5'):
                    print(f"Topics for Math, Grade 5, Common Core: {get_topics_for_framework('Math', 'Grade 5', 'Common Core')}")
                    if "Fractions" in get_topics_for_framework('Math', 'Grade 5', 'Common Core'):
                        print(f"Standards for Fractions: {get_standards_for_topic('Math', 'Grade 5', 'Common Core', 'Fractions')}")

        standard_id_to_test = "CCSS.MATH.CONTENT.5.NF.A.1"
        details = get_standard_details(standard_id_to_test)
        if details:
            print(f"Details for {standard_id_to_test}: {details['description']}")
        else:
            print(f"No details found for {standard_id_to_test}")
