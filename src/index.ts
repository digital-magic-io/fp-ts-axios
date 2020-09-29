import { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import * as t from 'io-ts'
import * as TE from 'fp-ts/lib/TaskEither'
import * as E from 'fp-ts/lib/Either'
import * as O from 'fp-ts/lib/Option'
import { pipe } from 'fp-ts/lib/pipeable'
import { PathReporter } from 'io-ts/PathReporter'
import { hasValue } from '@digital-magic/ts-common-utils/lib/type'
import { AppError, internalError, TaskEitherError } from './types'
import { ContentType, Header } from './constants'
import { Option } from 'fp-ts/Option'

/**
 * Type to convert AxiosError to some other type (for example AppError)
 */
export type AxiosErrorReader = (error: AxiosError) => AppError

const setupSessionIdHeader = (axios: AxiosInstance) => <T extends string>(sessionId: Option<T>): void =>
  pipe(
    sessionId,
    O.fold<T, void>(
      () => delete axios.defaults.headers[Header.XSessionId],
      (sessionId) => (axios.defaults.headers[Header.XSessionId] = sessionId)
    )
  )

// TODO: Write a test
// TODO: Write more generic FP code
function stripEmptyValues<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return (obj.filter(hasValue).map(stripEmptyValues) as unknown) as T
  }
  if (!(obj instanceof Object)) {
    return hasValue(obj) ? obj : ((undefined as unknown) as T)
  }
  return Object.fromEntries(Object.entries(obj).map(([prop, value]) => [prop, stripEmptyValues(value)])) as T
}

function decodeResponse<T, I, A extends t.Decoder<I, T>>(
  reqStr: () => string,
  body: I,
  decoder: A
): TaskEitherError<T> {
  // Empty response body must be handled using NonEmptyString or EmptyObject codec
  const validationResult = decoder.decode(body)
  return pipe(
    validationResult,
    E.mapLeft(() => internalError(`Parsing error on request: ${reqStr()} for entity: ${decoder.name}`)),
    // TODO: This is side effect and must be handled appropriately
    E.mapLeft((e) => {
      // tslint:disable-next-line:no-console
      console.error(e.message, body, PathReporter.report(validationResult))
      return e
    }),
    TE.fromEither
  )
}

const handleAxiosResponse = (axiosErrorReader: AxiosErrorReader) => <T>(
  response: Promise<AxiosResponse<T>>
): TaskEitherError<T> => {
  return TE.tryCatch<AppError, T>(
    () => response.then((r) => stripEmptyValues(r.data)), // Removes attributes that has undefined or null values
    (e) => axiosErrorReader(e as AxiosError)
  )
}

const handleResponse = <T, I, A extends t.Decoder<I, T>>(
  reqStr: () => string,
  decoder: A,
  task: TaskEitherError<I>
): TaskEitherError<T> =>
  pipe(
    task,
    TE.chain((res) => decodeResponse(reqStr, res, decoder))
  )

const doGet = (axios: AxiosInstance, axiosErrorReader: AxiosErrorReader) => <T, I, A extends t.Decoder<I, T>>(
  url: string,
  decoder: A,
  config?: AxiosRequestConfig
): TaskEitherError<T> =>
  handleResponse<T, I, A>(() => `GET ${url}`, decoder, handleAxiosResponse(axiosErrorReader)(axios.get<I>(url, config)))

const doPost = (axios: AxiosInstance, axiosErrorReader: AxiosErrorReader) => <T, I, B, A extends t.Decoder<I, T>>(
  url: string,
  decoder: A,
  body?: B,
  config?: AxiosRequestConfig
): TaskEitherError<T> =>
  handleResponse<T, I, A>(
    () => `POST ${url}`,
    decoder,
    handleAxiosResponse(axiosErrorReader)(axios.post<I>(url, body, config))
  )

const doDelete = (axios: AxiosInstance, axiosErrorReader: AxiosErrorReader) => <T, I, A extends t.Decoder<I, T>>(
  url: string,
  decoder: A,
  config?: AxiosRequestConfig
): TaskEitherError<T> =>
  handleResponse<T, I, A>(
    () => `DELETE ${url}`,
    decoder,
    handleAxiosResponse(axiosErrorReader)(axios.delete<I>(url, config))
  )

const doPut = (axios: AxiosInstance, axiosErrorReader: AxiosErrorReader) => <T, I, B, A extends t.Decoder<I, T>>(
  url: string,
  decoder: A,
  body?: B,
  config?: AxiosRequestConfig
): TaskEitherError<T> =>
  handleResponse<T, I, A>(
    () => `PUT ${url}`,
    decoder,
    handleAxiosResponse(axiosErrorReader)(axios.put<I>(url, body, config))
  )

export type CustomBodyContent =
  | { readonly type: 'FORM-DATA'; readonly data: FormData }
  | { readonly type: 'BINARY'; readonly contentType: string; readonly data: unknown }

export const binaryData = (contentType: string, data: unknown): CustomBodyContent => ({
  type: 'BINARY',
  contentType,
  data
})

export const formData = (data: FormData): CustomBodyContent => ({ type: 'FORM-DATA', data })

function getBodyContentParts(body: CustomBodyContent): readonly [string, unknown] {
  switch (body.type) {
    case 'BINARY':
      return [body.contentType, body.data]
    case 'FORM-DATA':
      return [ContentType.MultipartFormData, body.data]
  }
}

const doPostBinary = (axios: AxiosInstance, axiosErrorReader: AxiosErrorReader) => <T, I, A extends t.Decoder<I, T>>(
  url: string,
  decoder: A,
  body: CustomBodyContent
): TaskEitherError<T> => {
  const [contentType, data] = getBodyContentParts(body)
  const requestConfig: AxiosRequestConfig = {
    headers: {
      [Header.ContentType]: contentType
    }
  }
  return handleResponse<T, I, A>(
    () => `POST ${url}`,
    decoder,
    handleAxiosResponse(axiosErrorReader)(axios.post<I>(url, data, requestConfig))
  )
}

export const createAxiosClient = <T extends AxiosInstance>(axios: T, axiosErrorReader: AxiosErrorReader) => ({
  setupSessionIdHeader: setupSessionIdHeader(axios),
  get: doGet(axios, axiosErrorReader),
  post: doPost(axios, axiosErrorReader),
  delete: doDelete(axios, axiosErrorReader),
  put: doPut(axios, axiosErrorReader),
  postBinary: doPostBinary(axios, axiosErrorReader)
})
