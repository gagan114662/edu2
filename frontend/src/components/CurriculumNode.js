import React, { useState } from 'react';

const CurriculumNode = ({ label, data, path, onSelect }) => {
    const [isOpen, setIsOpen] = useState(false);
    // A standard is assumed to be an object with a 'description' key.
    // Other nodes (Subject, Grade, Framework, Topic) are objects containing other nodes or standards.
    const isStandard = data && typeof data.description === 'string' && !Object.keys(data).some(key => typeof data[key] === 'object' && key !== 'keywords');


    const handleToggle = (e) => {
        e.stopPropagation(); // Prevent event from bubbling up to parent node's toggle if nested.
        if (!isStandard && data && typeof data === 'object' && Object.keys(data).length > 0) {
            setIsOpen(!isOpen);
        }
    };

    const handleSelect = (e) => {
        e.stopPropagation();
        if (onSelect) {
            // For standards, pass standard ID (label) and its data.
            // For other hierarchical nodes (topics, frameworks etc.), pass the constructed path and the data object.
            if (isStandard) {
                onSelect({ id: label, type: 'standard', ...data, path: `${path}/${label}` });
            } else {
                 // Check if this node directly contains standards, making it a "topic-like" node.
                const containsStandards = typeof data === 'object' && data !== null && Object.values(data).some(v => v && typeof v.description === 'string');
                if(containsStandards) { // Only allow selection of topic-like nodes or standards
                    onSelect({ id: label, type: 'topic', path: `${path}/${label}`, data });
                } else if (Object.keys(data).length === 0) { // Or if it's an empty node (less likely)
                    onSelect({ id: label, type: 'empty_node', path: `${path}/${label}`, data });
                }
                // Non-selectable parent nodes (like Subject, Grade, Framework names) won't trigger onSelect from button
            }
        }
    };

    const nodeIsDirectParentOfStandards = typeof data === 'object' && data !== null && Object.values(data).some(v => v && typeof v.description === 'string' && !Object.keys(v).some(k => typeof v[k] === 'object' && k !== 'keywords'));
    const isSelectableNode = isStandard || nodeIsDirectParentOfStandards;


    return (
        <div className="ml-5 pl-2 border-l border-gray-300 hover:border-gray-400 transition-colors duration-150 ease-in-out">
            <div
                onClick={handleToggle}
                className={`flex items-center py-1.5 rounded-md group cursor-pointer ${!isStandard && Object.keys(data || {}).length > 0 ? 'hover:bg-gray-100' : ''}`}
                title={label}
            >
                {!isStandard && Object.keys(data || {}).length > 0 && (
                    <svg
                        className={`w-4 h-4 mr-1.5 text-gray-500 transform transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                )}
                <span className={`font-medium text-sm ${isStandard ? 'text-gray-700' : 'text-gray-800 group-hover:text-blue-600'}`}>
                    {label}
                </span>
                {isSelectableNode && (
                     <button
                        onClick={handleSelect}
                        className="ml-3 text-xs bg-blue-500 hover:bg-blue-600 text-white py-0.5 px-2 rounded-full shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                        title={isStandard ? `Select standard: ${label}` : `Focus on topic: ${label}`}
                    >
                        {isStandard ? 'Select' : 'Focus Topic'}
                    </button>
                )}
            </div>
            {isOpen && !isStandard && data && typeof data === 'object' && (
                <div className="mt-1">
                    {Object.entries(data).map(([key, value]) => (
                        <CurriculumNode
                            key={key}
                            label={key}
                            data={value}
                            path={`${path}/${label}`}
                            onSelect={onSelect}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default CurriculumNode;
