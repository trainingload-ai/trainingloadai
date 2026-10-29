const get200Response = (data: unknown) => {
  return {
    code: '200',
    message: 'success',
    data: data,
  };
};

const get400Response = (error: unknown) => {
  return {
    code: '400',
    message: error ? String(error) : '',
    data: null,
  };
};

export { get200Response, get400Response };
