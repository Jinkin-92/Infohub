"""
日志配置模块
使用 loguru 提供结构化日志
"""
import sys
import json
from pathlib import Path
from loguru import logger
from functools import wraps

# 移除默认处理器
logger.remove()


def setup_logging(
    level: str = "INFO",
    log_file: str = "logs/run.log",
    json_format: bool = True
):
    """
    配置日志系统

    Args:
        level: 日志级别 DEBUG/INFO/WARNING/ERROR
        log_file: 日志文件路径
        json_format: 是否使用JSON格式
    """
    # 确保日志目录存在
    Path(log_file).parent.mkdir(parents=True, exist_ok=True)

    # 控制台输出（开发友好格式）
    logger.add(
        sys.stdout,
        level=level,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
               "<level>{level: <8}</level> | "
               "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | "
               "{message}",
        colorize=True,
    )

    # 文件输出（结构化JSON格式）
    if json_format:
        def json_serializer(record):
            """将日志记录序列化为JSON"""
            log_entry = {
                "timestamp": record["time"].isoformat(),
                "level": record["level"].name,
                "message": record["message"],
                "module": record["name"],
                "function": record["function"],
                "line": record["line"],
                "extra": dict(record["extra"]),
            }
            return json.dumps(log_entry, ensure_ascii=False, default=str)

        logger.add(
            log_file,
            level=level,
            format="{message}",
            serialize=True,
            rotation="1 day",
            retention="30 days",
            compression="zip",
        )
    else:
        logger.add(
            log_file,
            level=level,
            format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} | {message}",
            rotation="1 day",
            retention="30 days",
            compression="zip",
        )

    return logger


def log_execution_time(func):
    """装饰器：记录函数执行时间"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        import time
        start = time.time()
        try:
            result = func(*args, **kwargs)
            duration = time.time() - start
            logger.debug(f"{func.__name__} completed in {duration:.3f}s")
            return result
        except Exception as e:
            duration = time.time() - start
            logger.error(f"{func.__name__} failed after {duration:.3f}s: {e}")
            raise
    return wrapper


class LogContext:
    """上下文管理器：为代码块添加结构化日志"""

    def __init__(self, operation: str, **context):
        self.operation = operation
        self.context = context
        self.start_time = None

    def __enter__(self):
        self.start_time = __import__('time').time()
        logger.info(f"Starting {self.operation}", extra=self.context)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        duration = __import__('time').time() - self.start_time
        if exc_type is None:
            logger.info(f"Completed {self.operation} in {duration:.3f}s", extra=self.context)
        else:
            logger.error(
                f"Failed {self.operation} after {duration:.3f}s: {exc_val}",
                extra={**self.context, "error": str(exc_val)}
            )
        return False  # 不吞噬异常


# 导出配置好的 logger
__all__ = ['logger', 'setup_logging', 'log_execution_time', 'LogContext']
