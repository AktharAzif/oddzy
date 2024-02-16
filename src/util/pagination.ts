const getPagination = (page: number, limit: number) => {
	page = page < 1 ? 0 : page - 1;
	limit = limit < 1 || limit > 100 ? 20 : limit;

	return {
		page,
		limit
	};
};

export default getPagination;
