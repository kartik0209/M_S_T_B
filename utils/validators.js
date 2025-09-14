exports.validateUserInput = (data) => {
    const errors = {};
    if (!data.username || data.username.trim() === '') {
        errors.username = 'Username is required';
    }
    if (!data.password || data.password.trim() === '') {
        errors.password = 'Password is required';
    }
    return {
        errors,
        isValid: Object.keys(errors).length === 0
    };
};

exports.validateTodoInput = (data) => {
    const errors = {};
    if (!data.text || data.text.trim() === '') {
        errors.text = 'Text is required';
    }
    if (!data.dueDate) {
        errors.dueDate = 'Due date is required';
    }
    return {
        errors,
        isValid: Object.keys(errors).length === 0
    };
};